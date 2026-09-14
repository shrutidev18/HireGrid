import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';

/**
 * The database and the file storage are mocked; **text extraction is not**.
 *
 * That split is deliberate. Storage is one `fs.writeFile` — mocking it keeps
 * the suite from leaving files behind and from depending on a writable
 * directory. Extraction is the part that can actually go wrong in surprising
 * ways, so these tests run real pdf-parse and real mammoth against real PDF
 * and DOCX fixtures. If either library changes its API or stops reading a
 * valid file, this suite fails rather than production.
 */
const tx = {
  resume: { findFirst: jest.fn(), delete: jest.fn() },
  application: { count: jest.fn() },
};

jest.mock('../config/db', () => ({
  prisma: {
    resume: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    application: { count: jest.fn() },
    $transaction: jest.fn(),
  },
  disconnectDb: jest.fn(),
}));

jest.mock('../services/storageService', () => ({
  uploadFile: jest.fn(),
  readFile: jest.fn(),
  deleteFile: jest.fn(),
}));

import app from '../app';
import { prisma } from '../config/db';
import * as storage from '../services/storageService';
import { signAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt';

const db = prisma as unknown as {
  resume: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock };
  application: { count: jest.Mock };
  $transaction: jest.Mock;
};
const store = storage as unknown as {
  uploadFile: jest.Mock;
  readFile: jest.Mock;
  deleteFile: jest.Mock;
};

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const RESUME_ID = 'eeeeeeee-0000-4000-8000-000000000005';
const cookie = [`${AUTH_COOKIE_NAME}=${signAuthToken(USER_ID)}`];

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, 'fixtures', name));

const PDF = fixture('sample-resume.pdf');
const DOCX = fixture('sample-resume.docx');
const TXT = fixture('not-a-resume.txt');

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const savedResume = {
  id: RESUME_ID,
  fileName: 'sample-resume.pdf',
  createdAt: new Date('2026-09-12T10:00:00Z'),
};

beforeEach(() => {
  db.$transaction.mockImplementation(async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx));
  tx.resume.findFirst.mockReset();
  tx.resume.delete.mockReset();
  tx.application.count.mockReset();
  store.uploadFile.mockResolvedValue({ key: 'generated-uuid.pdf', size: PDF.byteLength });
  store.deleteFile.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------

describe('authentication', () => {
  it('rejects every resume route without a valid cookie', async () => {
    const calls: Array<[string, () => request.Test]> = [
      ['GET /api/resumes', () => request(app).get('/api/resumes')],
      ['POST /api/resumes', () => request(app).post('/api/resumes')],
      ['GET /api/resumes/:id', () => request(app).get(`/api/resumes/${RESUME_ID}`)],
      [
        'GET /api/resumes/:id/download',
        () => request(app).get(`/api/resumes/${RESUME_ID}/download`),
      ],
      ['DELETE /api/resumes/:id', () => request(app).delete(`/api/resumes/${RESUME_ID}`)],
    ];

    for (const [label, call] of calls) {
      const res = await call();
      expect([label, res.status]).toEqual([label, 401]);
    }
  });
});

describe('POST /api/resumes', () => {
  it('accepts a PDF, extracts its text, and stores both', async () => {
    db.resume.create.mockResolvedValue(savedResume);

    const res = await request(app)
      .post('/api/resumes')
      .set('Cookie', cookie)
      .attach('file', PDF, { filename: 'sample-resume.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.resume.fileName).toBe('sample-resume.pdf');

    const written = db.resume.create.mock.calls[0][0].data;
    expect(written.userId).toBe(USER_ID);
    expect(written.fileName).toBe('sample-resume.pdf');
    // The stored value is the opaque key storage handed back, not a path the
    // application invented.
    expect(written.fileUrl).toBe('generated-uuid.pdf');
    // Real extraction ran — this text only exists inside the PDF's content
    // stream.
    expect(written.extractedText).toContain('PostgreSQL');
    expect(written.extractedText).toContain('Shruti Sharma');
  });

  it('accepts a DOCX and extracts its text', async () => {
    db.resume.create.mockResolvedValue({ ...savedResume, fileName: 'sample-resume.docx' });

    const res = await request(app)
      .post('/api/resumes')
      .set('Cookie', cookie)
      .attach('file', DOCX, { filename: 'sample-resume.docx', contentType: DOCX_MIME });

    expect(res.status).toBe(201);
    expect(db.resume.create.mock.calls[0][0].data.extractedText).toContain('PostgreSQL');
  });

  it('never returns the extracted text to the client', async () => {
    db.resume.create.mockResolvedValue(savedResume);

    const res = await request(app)
      .post('/api/resumes')
      .set('Cookie', cookie)
      .attach('file', PDF, { filename: 'sample-resume.pdf', contentType: 'application/pdf' });

    // It can be tens of kilobytes, no screen shows it, and it is only read
    // server-side by the AI analysis.
    expect(JSON.stringify(res.body)).not.toContain('PostgreSQL');
    expect(res.body.resume.extractedText).toBeUndefined();
  });

  it('rejects a .txt file at the middleware, before any work happens', async () => {
    const res = await request(app)
      .post('/api/resumes')
      .set('Cookie', cookie)
      .attach('file', TXT, { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only \.pdf and \.docx/i);
    expect(store.uploadFile).not.toHaveBeenCalled();
    expect(db.resume.create).not.toHaveBeenCalled();
  });

  it('rejects a text file disguised as a PDF by extension and MIME type', async () => {
    // Passes the extension check and the Content-Type check — both are just
    // claims made by the client. The magic-byte inspection is what catches it.
    const res = await request(app)
      .post('/api/resumes')
      .set('Cookie', cookie)
      .attach('file', TXT, { filename: 'resume.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a readable pdf or word document/i);
    expect(store.uploadFile).not.toHaveBeenCalled();
    expect(db.resume.create).not.toHaveBeenCalled();
  });

  it('rejects a file over 5MB', async () => {
    // A valid PDF header followed by padding, so only the size is wrong.
    const oversized = Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024, 0x20)]);

    const res = await request(app)
      .post('/api/resumes')
      .set('Cookie', cookie)
      .attach('file', oversized, { filename: 'huge.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5MB or smaller/i);
    expect(store.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects a request with no file attached', async () => {
    const res = await request(app).post('/api/resumes').set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/select a file/i);
  });

  it('deletes the stored file if the database write fails', async () => {
    db.resume.create.mockRejectedValue(new Error('database is down'));

    const res = await request(app)
      .post('/api/resumes')
      .set('Cookie', cookie)
      .attach('file', PDF, { filename: 'sample-resume.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(500);
    // Nothing references the file and nothing ever will, so it must not be
    // left behind — otherwise every failure leaks a file.
    expect(store.deleteFile).toHaveBeenCalledWith('generated-uuid.pdf');
  });
});

describe('GET /api/resumes', () => {
  it('lists only the requesting user’s resumes, without their text', async () => {
    db.resume.findMany.mockResolvedValue([savedResume]);

    const res = await request(app).get('/api/resumes').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.resumes).toHaveLength(1);

    const args = db.resume.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: USER_ID });
    expect(args.select.extractedText).toBeUndefined();
  });
});

describe('GET /api/resumes/:id', () => {
  it('returns the resume with the applications using it', async () => {
    db.resume.findFirst.mockResolvedValue({
      ...savedResume,
      applications: [{ id: 'app-1', companyName: 'Acme Corp', jobTitle: 'Backend Intern' }],
    });

    const res = await request(app).get(`/api/resumes/${RESUME_ID}`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.resume.applications).toHaveLength(1);
    expect(db.resume.findFirst.mock.calls[0][0].where).toEqual({
      id: RESUME_ID,
      userId: USER_ID,
    });
  });

  it("returns 404 for another user's resume", async () => {
    db.resume.findFirst.mockResolvedValue(null);

    const res = await request(app).get(`/api/resumes/${RESUME_ID}`).set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Resume not found', statusCode: 404 });
  });
});

describe('GET /api/resumes/:id/download', () => {
  it('streams the file with download headers', async () => {
    db.resume.findFirst.mockResolvedValue({
      fileName: 'sample-resume.pdf',
      fileUrl: 'generated-uuid.pdf',
    });
    store.readFile.mockResolvedValue(PDF);

    const res = await request(app)
      .get(`/api/resumes/${RESUME_ID}/download`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('sample-resume.pdf');
    // Stops a browser second-guessing the type and rendering an upload as HTML.
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('sanitises a filename that tries to inject header parameters', async () => {
    db.resume.findFirst.mockResolvedValue({
      fileName: 'evil"; attachment; filename="hacked.pdf',
      fileUrl: 'generated-uuid.pdf',
    });
    store.readFile.mockResolvedValue(PDF);

    const res = await request(app)
      .get(`/api/resumes/${RESUME_ID}/download`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    // The quote that would have closed the filename parameter early is gone.
    const disposition = res.headers['content-disposition'] as string;
    expect(disposition.match(/filename="/g)).toHaveLength(1);
  });

  it('returns 404 when the row exists but the file is gone', async () => {
    db.resume.findFirst.mockResolvedValue({
      fileName: 'sample-resume.pdf',
      fileUrl: 'missing.pdf',
    });
    store.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const res = await request(app)
      .get(`/api/resumes/${RESUME_ID}/download`)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/resumes/:id', () => {
  it('refuses to delete a resume an application still uses', async () => {
    tx.resume.findFirst.mockResolvedValue({ id: RESUME_ID, fileUrl: 'generated-uuid.pdf' });
    tx.application.count.mockResolvedValue(2);

    const res = await request(app).delete(`/api/resumes/${RESUME_ID}`).set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'This resume is used in 2 application(s) and cannot be deleted',
      statusCode: 400,
    });

    // Neither the row nor the file is touched. Without this rule the database's
    // SetNull would silently detach the resume from both applications.
    expect(tx.resume.delete).not.toHaveBeenCalled();
    expect(store.deleteFile).not.toHaveBeenCalled();
  });

  it('deletes an unused resume and its file', async () => {
    tx.resume.findFirst.mockResolvedValue({ id: RESUME_ID, fileUrl: 'generated-uuid.pdf' });
    tx.application.count.mockResolvedValue(0);
    tx.resume.delete.mockResolvedValue({ id: RESUME_ID });

    const res = await request(app).delete(`/api/resumes/${RESUME_ID}`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(tx.resume.delete).toHaveBeenCalledWith({ where: { id: RESUME_ID } });
    // The file is removed only after the transaction commits — a filesystem
    // delete cannot be rolled back.
    expect(store.deleteFile).toHaveBeenCalledWith('generated-uuid.pdf');
  });

  it('counts references without scoping to the user', async () => {
    tx.resume.findFirst.mockResolvedValue({ id: RESUME_ID, fileUrl: 'k.pdf' });
    tx.application.count.mockResolvedValue(0);
    tx.resume.delete.mockResolvedValue({ id: RESUME_ID });

    await request(app).delete(`/api/resumes/${RESUME_ID}`).set('Cookie', cookie);

    // The question is "does anything still point at this row?" — scoping the
    // count could under-count and allow a delete that breaks a reference.
    expect(tx.application.count).toHaveBeenCalledWith({ where: { resumeId: RESUME_ID } });
  });

  it("returns 404 for another user's resume", async () => {
    tx.resume.findFirst.mockResolvedValue(null);

    const res = await request(app).delete(`/api/resumes/${RESUME_ID}`).set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(tx.resume.delete).not.toHaveBeenCalled();
  });
});

import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

/**
 * Pulls the plain text out of an uploaded resume.
 *
 * This is done once, at upload time, and the result is stored on the Resume
 * row. Every AI analysis then reads that column instead of re-parsing the
 * file — which is what makes comparing one resume against twenty job
 * descriptions cheap.
 */

export type FileKind = 'pdf' | 'docx';

/**
 * Identifies a file by its first few bytes rather than by what the upload
 * claimed it was.
 *
 * The `Content-Type` header and the file extension are both supplied by the
 * client, which makes them a claim, not a fact — anyone can rename `payload.exe`
 * to `resume.pdf` and set whatever MIME type they like. Magic bytes are part of
 * the file itself.
 *
 *   PDF  → "%PDF-"
 *   DOCX → "PK\x03\x04", the ZIP header (a .docx is a zip of XML parts)
 *
 * Returns null for anything else, which the caller turns into a 400.
 */
export function sniffFileKind(buffer: Buffer): FileKind | null {
  if (buffer.length < 4) return null;

  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'pdf';
  }

  // Every ZIP-based format shares this header, so this alone does not prove
  // the file is a .docx — it proves it is a zip container. Mammoth fails
  // cleanly on a zip that is not a Word document, and that failure surfaces as
  // "could not read any text", which is the right message either way.
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'docx';
  }

  return null;
}

/** Collapses the ragged whitespace that PDF extraction tends to produce. */
function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    // Three or more blank lines become one blank line; paragraph breaks are
    // meaningful to the AI analysis, but twelve of them are not.
    .replace(/\n{3,}/g, '\n\n')
    // Runs of spaces and tabs, common where a PDF positions text by
    // coordinates rather than in flowing lines.
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Extracts text from a PDF or DOCX buffer.
 *
 * Returns an empty string when the file parses but genuinely contains no text
 * — a scanned resume that is really a photograph of a page, for example. The
 * caller decides what to do about that; this function does not guess.
 */
export async function extractText(buffer: Buffer, kind: FileKind): Promise<string> {
  if (kind === 'pdf') {
    // pdf-parse v2 is a class, not the single function v1 exposed, and it
    // holds a pdf.js document open until destroyed — hence the finally.
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normaliseWhitespace(result.text ?? '');
    } finally {
      await parser.destroy();
    }
  }

  // `extractRawText` deliberately, not `convertToHtml`: the AI analysis wants
  // the words, and formatting markup would be noise in the prompt and in the
  // keyword matching.
  const result = await mammoth.extractRawText({ buffer });
  return normaliseWhitespace(result.value ?? '');
}

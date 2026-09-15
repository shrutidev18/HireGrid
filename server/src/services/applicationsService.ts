import { prisma, type TransactionClient } from '../config/db';
import { badRequest, notFound } from '../utils/AppError';
import { requestAnalysisIfPossible } from './analysisService';
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
  UpdateStatusInput,
} from '../utils/validators';

/**
 * Relations loaded when returning a single application.
 *
 * The details page shows all of this at once, so fetching it in one query
 * beats three round trips. `statusHistory` is ordered ascending because that
 * is chronological order — the client reverses it for display, which is a
 * presentation choice, not a data one.
 */
const applicationDetailInclude = {
  statusHistory: { orderBy: { changedAt: 'asc' } },
  analysisResult: true,
  resume: { select: { id: true, fileName: true } },
} as const;

/**
 * The single most important function in this file.
 *
 * Every read and write in this service goes through an ownership check first,
 * and the check is `id AND userId` — never `id` alone. That is what enforces
 * "a user can only ever touch their own data", and it holds no matter what id
 * the client sends, because `userId` comes from the signed JWT rather than
 * from anything the client controls.
 *
 * It throws **404, not 403**, when the row exists but belongs to someone else.
 * A 403 would confirm the application exists, which leaks information: an
 * attacker enumerating ids could map out how many applications other users
 * have. From the outside, "not yours" and "not there" must be
 * indistinguishable.
 */
async function findOwnedApplicationId(userId: string, id: string): Promise<string> {
  const found = await prisma.application.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!found) {
    throw notFound('Application not found');
  }

  return found.id;
}

/**
 * Applies the same rule to a resume being attached to an application.
 *
 * Without this, a user could pass someone else's resumeId and link their
 * application to a stranger's resume — a cross-user data leak through a field
 * that looks harmless. Any id arriving from the client is checked against the
 * requester before it is stored.
 */
async function assertResumeBelongsToUser(userId: string, resumeId: string): Promise<void> {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    select: { id: true },
  });

  if (!resume) {
    // 400 rather than 404: the *application* request is what is malformed —
    // it references a resume the user cannot use. And as above, this reveals
    // nothing about whether that resume exists for somebody else.
    throw badRequest('The selected resume could not be found');
  }
}

/** Everything the current user is tracking, most recently touched first. */
export async function listApplications(userId: string) {
  return prisma.application.findMany({
    where: { userId },

    // Ordered by updatedAt rather than createdAt so an application the user
    // just moved to "Interview" rises to the top — recency of activity is
    // more useful than recency of entry.
    orderBy: { updatedAt: 'desc' },

    // Deliberately not loading statusHistory or the job description here. A
    // list of fifty applications does not need fifty full job descriptions,
    // and sending them would make the list slow for no visible benefit.
    select: {
      id: true,
      companyName: true,
      jobTitle: true,
      jobLocation: true,
      employmentType: true,
      workMode: true,
      status: true,
      dateApplied: true,
      salary: true,
      createdAt: true,
      updatedAt: true,
      resume: { select: { id: true, fileName: true } },
      analysisResult: { select: { status: true, matchScore: true } },
    },
  });
}

/**
 * Creates an application together with the first entry in its history.
 *
 * The two writes are one nested create, which Prisma runs in a single
 * transaction. That matters: an application whose history does not start with
 * its own creation is a broken record, and the timeline would begin from the
 * first *change* instead of from the beginning. Doing it as two separate
 * `create` calls would leave exactly that state behind if the second failed.
 */
export async function createApplication(userId: string, input: CreateApplicationInput) {
  const { status, resumeId, ...fields } = input;

  if (resumeId) {
    await assertResumeBelongsToUser(userId, resumeId);
  }

  const application = await prisma.application.create({
    data: {
      ...fields,
      userId,
      status,
      resumeId: resumeId ?? null,
      statusHistory: {
        create: {
          status,
          note: 'Application created',
        },
      },
    },
    include: applicationDetailInclude,
  });

  /**
   * Start the AI analysis, but only when there is something to analyse — an
   * application saved without a resume has nothing to compare the job
   * description against.
   *
   * This is awaited rather than left dangling, so the PENDING row exists
   * before the response returns and the client's first poll finds it. What it
   * does *not* do is wait for the analysis itself: the job is queued and a
   * separate worker process picks it up, which is the whole reason the queue
   * exists. `requestAnalysisIfPossible` also swallows its own failures, so a
   * Redis outage cannot stop an application being created.
   */
  if (application.resumeId && application.jobDescription) {
    await requestAnalysisIfPossible(userId, application.id);
  }

  return application;
}

/** One application with its history, analysis and resume. */
export async function getApplication(userId: string, id: string) {
  const application = await prisma.application.findFirst({
    where: { id, userId },
    include: applicationDetailInclude,
  });

  if (!application) {
    throw notFound('Application not found');
  }

  return application;
}

/**
 * Updates the editable fields.
 *
 * `status` cannot arrive here — the Zod schema does not accept it — so there
 * is no path by which a status changes without a matching history row.
 */
export async function updateApplication(
  userId: string,
  id: string,
  input: UpdateApplicationInput,
) {
  await findOwnedApplicationId(userId, id);

  if (input.resumeId) {
    await assertResumeBelongsToUser(userId, input.resumeId);
  }

  // Safe to update by id alone now that ownership is established. `userId` is
  // never in `data`, so an application cannot be reassigned to another user.
  return prisma.application.update({
    where: { id },
    data: input,
    include: applicationDetailInclude,
  });
}

/**
 * Moves an application to a new stage.
 *
 * The update and the history insert happen inside one interactive transaction
 * because they are two halves of one fact. If the update succeeded and the
 * insert failed, the application would show a stage its timeline has no record
 * of; if the insert succeeded and the update failed, the timeline would claim
 * a stage the application is not in. Either outcome is corrupt, and neither is
 * recoverable by retrying — so they commit together or not at all.
 *
 * The ownership check is inside the transaction too, so it is evaluated
 * against the same snapshot as the writes.
 */
export async function updateApplicationStatus(
  userId: string,
  id: string,
  input: UpdateStatusInput,
) {
  return prisma.$transaction(async (tx: TransactionClient) => {
    const existing = await tx.application.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      throw notFound('Application not found');
    }

    // Order matters, and not for correctness of the data — the transaction
    // guarantees that either way — but for what the response contains.
    //
    // `applicationDetailInclude` loads statusHistory, so the application has
    // to be read *after* the new history row exists. Updating first returned
    // an application whose history was missing the very change that had just
    // been made; the client cached that response and rendered a timeline one
    // entry behind its own status badge until something forced a refetch.
    const statusHistory = await tx.statusHistory.create({
      data: {
        applicationId: id,
        status: input.status,
        note: input.note,
      },
    });

    const application = await tx.application.update({
      where: { id },
      data: { status: input.status },
      include: applicationDetailInclude,
    });

    return { application, statusHistory };
  });
}

/**
 * Deletes an application.
 *
 * Its StatusHistory rows and AnalysisResult go with it, but nothing here says
 * so — that is the `onDelete: Cascade` declared in the schema, enforced by
 * PostgreSQL. Deleting children in application code would be a second place
 * for the rule to live and a chance to forget one.
 *
 * An attached resume is *not* deleted. It is a separate thing the user owns
 * and may be using elsewhere.
 */
export async function deleteApplication(userId: string, id: string): Promise<void> {
  await findOwnedApplicationId(userId, id);

  await prisma.application.delete({ where: { id } });
}

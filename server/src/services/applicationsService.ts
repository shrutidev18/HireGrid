import { prisma, type TransactionClient } from '../config/db';
import { badRequest, notFound } from '../utils/AppError';
import { requestAnalysisIfPossible } from './analysisService';
import type {
  CreateApplicationInput,
  ListApplicationsQuery,
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
/**
 * Columns returned in a list.
 *
 * Deliberately not loading statusHistory or the job description here. A page
 * of twenty applications does not need twenty full job descriptions, and
 * sending them would make the table slow for no visible benefit.
 */
const applicationListSelect = {
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
} as const;

/**
 * Translates the parsed query into a Prisma `where` clause.
 *
 * Built by adding keys only when a filter is actually present, rather than
 * always including every key and passing `undefined`. Prisma does ignore
 * `undefined`, so both work — but a clause assembled this way is the thing you
 * can log and read to answer "why did this row not come back", which is the
 * question you actually have when a filter misbehaves.
 *
 * `userId` is set first and unconditionally. It is never derived from anything
 * the client sends, so no combination of query parameters can widen the result
 * beyond the requester's own rows.
 */
function buildApplicationWhere(userId: string, query: ListApplicationsQuery) {
  /**
   * The end of the chosen day, not its midnight.
   *
   * A date input sends `2026-09-10`, which parses to 00:00 on the 10th. Used
   * as-is with `lte`, an application saved at 09:30 that morning falls outside
   * its own date — the user picks a range ending "today" and today's rows
   * vanish. Pushing the bound to the last millisecond of the day makes the
   * filter mean what the UI says it means: inclusive of both ends.
   */
  const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
  dateTo?.setHours(23, 59, 59, 999);

  return {
    userId,

    /**
     * One search box across three columns. `mode: 'insensitive'` is what makes
     * "infosys" find "Infosys" — PostgreSQL's `LIKE` is case-sensitive, so
     * without it the feature quietly only works when the user happens to match
     * the company's own capitalisation.
     */
    ...(query.search
      ? {
          OR: [
            { companyName: { contains: query.search, mode: 'insensitive' as const } },
            { jobTitle: { contains: query.search, mode: 'insensitive' as const } },
            { jobLocation: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),

    ...(query.status ? { status: query.status } : {}),
    ...(query.employmentType ? { employmentType: query.employmentType } : {}),
    ...(query.workMode ? { workMode: query.workMode } : {}),
    ...(query.resumeId ? { resumeId: query.resumeId } : {}),

    ...(query.dateFrom || dateTo
      ? {
          dateApplied: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };
}

/**
 * Sort order, always with a tiebreaker.
 *
 * The second key is not decoration. With `ORDER BY dateApplied DESC` alone,
 * rows sharing a date have no defined order, and PostgreSQL is free to return
 * them differently between two queries. Under pagination that means a row can
 * appear on page 1 and again on page 2 while another is never shown at all.
 * Appending a unique column makes the total order deterministic.
 *
 * `nulls: 'last'` matters for `dateApplied`, which is null for anything still
 * at SAVED. Sorted descending, nulls sort first by default, so the entire top
 * of the table would be applications the user has not applied to yet.
 */
function buildApplicationOrderBy(query: ListApplicationsQuery) {
  const direction = query.sortOrder;
  const tiebreak = { id: 'asc' as const };

  /**
   * An explicit branch per column rather than `{ [query.sortBy]: direction }`.
   *
   * The computed-key version is shorter and worse. It puts a value that
   * originated in the URL into the position where a column name goes, and the
   * only thing standing between that and an arbitrary column is the Zod enum.
   * Spelling the three cases out means the set of sortable columns is fixed in
   * the code, the compiler checks each one against the schema, and the switch
   * is exhaustive — a fourth sort field added to the enum without being
   * handled here fails to compile rather than failing at runtime.
   */
  switch (query.sortBy) {
    case 'companyName':
      return [{ companyName: direction }, tiebreak];

    /**
     * `nulls: 'last'` matters here and nowhere else. `dateApplied` is null for
     * anything still at SAVED, and sorted descending, nulls come first by
     * default — so the entire top of the table would be applications the user
     * has not actually applied to yet.
     */
    case 'dateApplied':
      return [{ dateApplied: { sort: direction, nulls: 'last' as const } }, tiebreak];

    case 'updatedAt':
      return [{ updatedAt: direction }, tiebreak];
  }
}

/**
 * One page of the user's applications, with the total for the pager.
 *
 * Defaults to ordering by `updatedAt` rather than `createdAt` so an
 * application the user just moved to "Tech Interview" rises to the top —
 * recency of activity is more useful than recency of entry.
 */
export async function listApplications(userId: string, query: ListApplicationsQuery) {
  const where = buildApplicationWhere(userId, query);

  /**
   * The count and the page are fetched together.
   *
   * `total` has to be computed against the same filters as the rows, otherwise
   * the pager shows a page count that does not match what paging through
   * actually produces. Running them concurrently rather than in sequence means
   * the extra query costs no extra latency.
   */
  const [total, data] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: buildApplicationOrderBy(query),

      // Offset pagination. Keyset pagination scales better on very large
      // tables, but it cannot jump to an arbitrary page — and a pager with
      // numbered pages is exactly what this screen asks for. At the scale of
      // one person's job applications, offset is the right trade.
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,

      select: applicationListSelect,
    }),
  ]);

  return { data, total, page: query.page, pageSize: query.pageSize };
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

import { prisma } from '../config/db';
import { badRequest, notFound } from '../utils/AppError';
import { enqueueAnalysis } from '../queues/analysisQueue';

/**
 * Orchestrates analysis requests. It does not call Gemini — it only decides
 * whether an analysis should happen and puts a job on the queue.
 */

/**
 * Loads an application together with the text an analysis needs, scoped to the
 * requesting user.
 *
 * The ownership rule is the same one every other resource follows: filter on
 * `id AND userId`, and treat someone else's record as absent rather than
 * forbidden. Analysis routes are nested under an application, so the check
 * happens on the parent — there is no way to reach an analysis except through
 * an application the user owns.
 */
async function findOwnedApplicationForAnalysis(userId: string, applicationId: string) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: {
      id: true,
      jobDescription: true,
      resume: { select: { extractedText: true } },
    },
  });

  if (!application) {
    throw notFound('Application not found');
  }

  return application;
}

/** The current analysis for an application, or null if none has been requested. */
export async function getAnalysis(userId: string, applicationId: string) {
  // Ownership first: without this, any authenticated user could read any
  // analysis by guessing an application id.
  await findOwnedApplicationForAnalysis(userId, applicationId);

  // Null rather than 404 when no analysis exists. "This application has no
  // analysis" is a normal state — an application saved without a resume — and
  // the client renders a prompt for it rather than an error.
  return prisma.analysisResult.findUnique({ where: { applicationId } });
}

/**
 * Queues an analysis, creating or resetting the result row to PENDING first.
 *
 * The PENDING row is written **before** the job is enqueued, and that order
 * matters: the client starts polling the moment the request returns, and a
 * missing row would look like "no analysis" rather than "analysis starting".
 *
 * Resetting the fields on a re-analysis is equally deliberate — leaving the
 * old score and skills in place would have the UI show a stale result
 * alongside a spinner claiming to be working on it.
 */
export async function requestAnalysis(userId: string, applicationId: string): Promise<void> {
  const application = await findOwnedApplicationForAnalysis(userId, applicationId);

  const resumeText = application.resume?.extractedText;

  if (!resumeText) {
    throw badRequest('Attach a resume to this application before running an analysis');
  }

  if (!application.jobDescription) {
    throw badRequest('Add a job description to this application before running an analysis');
  }

  const pendingFields = {
    status: 'PENDING' as const,
    requiredSkills: [],
    preferredSkills: [],
    matchedSkills: [],
    missingSkills: [],
    matchScore: null,
    atsKeywordsPresent: [],
    atsKeywordsMissing: [],
    suggestions: [],
    reasoning: null,
  };

  await prisma.analysisResult.upsert({
    where: { applicationId },
    update: pendingFields,
    create: { applicationId, ...pendingFields },
  });

  await enqueueAnalysis({
    applicationId,
    resumeText,
    jobDescription: application.jobDescription,
  });
}

/**
 * Starts an analysis for a newly created application, if it has what an
 * analysis needs.
 *
 * Failures here are logged and swallowed. Creating an application must not
 * fail because Redis is briefly unavailable — the user's actual intent was to
 * save the application, and the analysis is an enhancement they can retry from
 * the details page. Letting this throw would turn a queue outage into an
 * inability to use the core feature of the product.
 */
export async function requestAnalysisIfPossible(
  userId: string,
  applicationId: string,
): Promise<void> {
  try {
    await requestAnalysis(userId, applicationId);
  } catch (err) {
    console.warn(
      `[hiregrid] could not start analysis for application ${applicationId}:`,
      (err as Error).message,
    );
  }
}

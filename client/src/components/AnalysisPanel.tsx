import { useState } from 'react';
import { Link } from 'react-router-dom';

import MatchScoreMeter from './MatchScoreMeter';
import { useAnalysis, useReanalyze } from '../hooks/useAnalysis';
import { getApiErrorMessage } from '../api/client';
import type { AnalysisResult } from '../types/api';

/**
 * Pulls the part of the reasoning that mentions a particular missing skill.
 *
 * The AI returns **one** `reasoning` string covering every missing skill,
 * because that is the schema the phase specification fixes. The UI, though,
 * asks for each missing skill to expand and show *its* reasoning. The bridge
 * is that the system instruction tells the model to explain each missing skill
 * in that field, so the sentences are there — they just need locating.
 *
 * Falls back to the whole reasoning when no sentence names the skill, which is
 * more useful than an empty panel.
 */
function reasoningFor(skill: string, reasoning: string | null): string | null {
  if (!reasoning) return null;

  const sentences = reasoning.split(/(?<=[.!?])\s+/);
  const needle = skill.toLowerCase();
  const matches = sentences.filter((sentence) => sentence.toLowerCase().includes(needle));

  return matches.length > 0 ? matches.join(' ') : reasoning;
}

/** A list of keywords, or a dash when there are none. */
function KeywordList({ items, tone }: { items: string[]; tone: 'present' | 'missing' }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">None</p>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={`rounded-md px-2 py-0.5 text-xs ${
            tone === 'present'
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
              : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function CompletedAnalysis({ analysis }: { analysis: AnalysisResult }) {
  // Which missing skill is expanded. One at a time — several open at once
  // turns the section into a wall of text.
  const [openSkill, setOpenSkill] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {analysis.matchScore !== null && <MatchScoreMeter score={analysis.matchScore} />}

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Matched skills ({analysis.matchedSkills.length})
            </h3>
            {analysis.matchedSkills.length === 0 ? (
              <p className="text-sm text-slate-400">
                None of the required skills were found in your resume.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {analysis.matchedSkills.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Missing skills ({analysis.missingSkills.length})
            </h3>
            {analysis.missingSkills.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing obvious is missing.</p>
            ) : (
              <>
                <ul className="flex flex-wrap gap-1.5">
                  {analysis.missingSkills.map((skill) => {
                    const isOpen = openSkill === skill;
                    return (
                      <li key={skill}>
                        <button
                          type="button"
                          onClick={() => setOpenSkill(isOpen ? null : skill)}
                          aria-expanded={isOpen}
                          className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 transition-colors ${
                            isOpen
                              ? 'bg-red-100 text-red-800 ring-red-300'
                              : 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100'
                          }`}
                        >
                          {skill}
                          <span aria-hidden="true" className="ml-1 opacity-60">
                            {isOpen ? '−' : '+'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {openSkill && (
                  <div className="mt-2 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2">
                    <p className="text-xs font-medium text-red-800">
                      Why {openSkill} matters here
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">
                      {reasoningFor(openSkill, analysis.reasoning) ??
                        'No reasoning was provided for this skill.'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          ATS keywords
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs text-slate-500">In your resume</p>
            <KeywordList items={analysis.atsKeywordsPresent} tone="present" />
          </div>
          <div>
            <p className="mb-1.5 text-xs text-slate-500">Missing from your resume</p>
            <KeywordList items={analysis.atsKeywordsMissing} tone="missing" />
          </div>
        </div>
      </div>

      {analysis.suggestions.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Suggestions
          </h3>
          <ul className="space-y-1.5">
            {analysis.suggestions.map((suggestion) => (
              <li key={suggestion} className="flex gap-2 text-sm text-slate-700">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(analysis.requiredSkills.length > 0 || analysis.preferredSkills.length > 0) && (
        <details className="rounded-xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-500">
            What the posting asks for
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs text-slate-500">Required</p>
              <KeywordList items={analysis.requiredSkills} tone="missing" />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-slate-500">Preferred</p>
              <KeywordList items={analysis.preferredSkills} tone="missing" />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * The AI analysis section of the application details page.
 *
 * Four states, and each one exists because it genuinely happens: there is no
 * analysis yet, one is running, one finished, one failed. The failure state
 * matters most — an analysis that silently never arrives would leave a spinner
 * spinning forever with nothing the user could do about it.
 */
export default function AnalysisPanel({
  applicationId,
  hasResume,
}: {
  applicationId: string;
  hasResume: boolean;
}) {
  const { data: analysis, isPending, isError, error } = useAnalysis(applicationId);
  const reanalyze = useReanalyze(applicationId);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function handleRetry() {
    setRetryError(null);
    try {
      await reanalyze.mutateAsync();
    } catch (err) {
      setRetryError(getApiErrorMessage(err, 'Could not start the analysis.'));
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-900">AI analysis</h2>

        {analysis?.status === 'COMPLETED' && (
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={reanalyze.isPending}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {reanalyze.isPending ? 'Starting…' : 'Re-analyze'}
          </button>
        )}
      </div>

      {isPending && <p className="text-sm text-slate-500">Loading…</p>}

      {isError && (
        <p role="alert" className="text-sm text-red-600">
          {getApiErrorMessage(error, 'Could not load the analysis.')}
        </p>
      )}

      {/* No analysis has ever been requested. */}
      {!isPending && !isError && analysis === null && (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
          {hasResume ? (
            <>
              <p className="text-sm text-slate-600">
                No analysis has been run for this application yet.
              </p>
              <button
                type="button"
                onClick={() => void handleRetry()}
                disabled={reanalyze.isPending}
                className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {reanalyze.isPending ? 'Starting…' : 'Analyze this application'}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Attach a resume to see how well it matches this role.
              </p>
              <Link
                to={`/applications/${applicationId}/edit`}
                className="mt-3 inline-block text-sm font-medium text-brand-600 underline-offset-2 hover:underline"
              >
                Edit this application
              </Link>
            </>
          )}
        </div>
      )}

      {analysis?.status === 'PENDING' && (
        <div className="flex items-center gap-3 rounded-xl bg-brand-50/60 px-4 py-5">
          <div
            className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"
            role="status"
            aria-label="Analysis in progress"
          />
          <div>
            <p className="text-sm font-medium text-slate-800">
              Analyzing your fit for this role…
            </p>
            <p className="text-xs text-slate-500">
              This usually takes a few seconds. The page updates on its own.
            </p>
          </div>
        </div>
      )}

      {analysis?.status === 'FAILED' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">The analysis could not be completed.</p>
          <p className="mt-1 text-sm text-red-700">
            The AI service may be unavailable or over its rate limit. Your application is
            saved — only the analysis failed.
          </p>

          {retryError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {retryError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={reanalyze.isPending}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {reanalyze.isPending ? 'Starting…' : 'Retry analysis'}
          </button>
        </div>
      )}

      {analysis?.status === 'COMPLETED' && <CompletedAnalysis analysis={analysis} />}
    </section>
  );
}

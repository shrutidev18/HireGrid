import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useDashboard } from '../hooks/useDashboard';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorMessage } from '../api/client';
import { STATUS_LABELS, type ApplicationStatus } from '../types/api';
import { formatRelative } from '../utils/format';

/**
 * The dashboard.
 *
 * Every chart here answers one question with one measure, so every chart is a
 * single series — which settles the colour question before it is asked. There
 * is no identity to encode, so there are no categorical hues, no legends, and
 * no temptation to colour bars by their own length (that would double-encode
 * magnitude, burning the one free channel on information the bar already
 * shows).
 */

/**
 * The project's own brand step, not a chart-library default.
 *
 * Validated against the white card surface: inside the lightness band, above
 * the chroma floor, and over 3:1 contrast. The CVD checks do not apply — they
 * exist to keep *series* apart, and there is only ever one series here.
 */
const SERIES = '#006edc';

/** Chrome, one shade off the surface so it recedes behind the data. */
const GRID = '#e2e8f0';
const AXIS_TEXT = '#64748b';

/** Rejected is the one bar that is not a stage of progress. */
const MUTED_SERIES = '#94a3b8';

const axisTick = { fill: AXIS_TEXT, fontSize: 12 };

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Card({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}
    >
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * A stat tile, not a chart.
 *
 * Five single numbers is exactly the case where a chart is the wrong answer —
 * the number *is* the chart. Figures are proportional rather than tabular:
 * equal-width digits make a large standalone number look loose.
 */
function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** A shared tooltip shell, so all three charts read identically on hover. */
function ChartTooltip({
  active,
  label,
  value,
}: {
  active?: boolean;
  label?: string;
  value?: string;
}) {
  if (!active || value === undefined) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="text-slate-600">{value}</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[12rem] items-center justify-center rounded-xl border border-dashed border-slate-200">
      <p className="px-6 text-center text-sm text-slate-500">{message}</p>
    </div>
  );
}

/** "2026-09-14" → "14 Sep", for an axis where the year is the same throughout. */
function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isPending, isError, error, isFetching } = useDashboard();

  if (isPending) {
    return <p className="text-sm text-slate-500">Loading your dashboard…</p>;
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {getApiErrorMessage(error, 'Could not load your dashboard.')}
      </div>
    );
  }

  const { summary, statusFunnel, matchScoreTrend, skillGapAggregation } = data;
  const { needsAttention, recentActivity } = data;

  // -- Empty state ----------------------------------------------------------

  if (summary.totalApplications === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          {`Welcome to HireGrid, ${user?.name ?? ''}`.trim()}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Add the first job you are tracking and this page fills in — where your
          applications stand, how your match scores are trending, and which skills keep
          coming up as gaps.
        </p>
        <Link
          to="/applications/new"
          className="mt-5 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Add your first application
        </Link>
      </div>
    );
  }

  const trendHasData = matchScoreTrend.some((point) => point.avgScore !== null);

  return (
    /*
     * Held at reduced opacity while refetching rather than swapped for a
     * skeleton. A skeleton on refetch throws the whole layout away and back,
     * which reads as a page reload for what is usually a byte-identical
     * payload.
     */
    <div className={`transition-opacity ${isFetching ? 'opacity-70' : 'opacity-100'}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {`Welcome back, ${user?.name ?? ''}`.trim()}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Where everything stands right now.
        </p>
      </div>

      {/* -- Summary ------------------------------------------------------- */}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Applications"
          value={String(summary.totalApplications)}
          hint="tracked in total"
        />
        <StatTile
          label="Active"
          value={String(summary.activeApplications)}
          hint="still in play"
        />
        <StatTile
          label="Interviews"
          value={String(summary.interviewsThisWeek)}
          hint="active this week"
        />
        <StatTile
          label="Avg match"
          /*
           * An em dash, not 0. "No analysis has completed yet" and "your
           * resumes score zero" are very different statements, and a 0 here
           * would be the alarming one shown for the innocent case.
           */
          value={summary.avgMatchScore === null ? '—' : `${summary.avgMatchScore}%`}
          hint={summary.avgMatchScore === null ? 'no analyses yet' : 'across completed analyses'}
        />
        <StatTile
          label="Offers"
          value={String(summary.offersReceived)}
          hint="received"
        />
      </div>

      {/* -- Funnel + trend ------------------------------------------------ */}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Where your applications stand" subtitle="Applications at each stage">
          {/*
            Horizontal bars, not vertical. Seven stages with names like "Online
            Assessment" cannot label a vertical axis without rotating the text
            to 45°, which is harder to read than simply putting the labels
            where they are already horizontal.
          */}
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={statusFunnel.map((entry) => ({
                ...entry,
                label: STATUS_LABELS[entry.status],
              }))}
              layout="vertical"
              margin={{ top: 4, right: 32, bottom: 4, left: 8 }}
              barCategoryGap={6}
            >
              {/* Solid hairline. Recharts defaults to a dashed grid, which
                  reads as "threshold" or "projection" when it is just a grid. */}
              <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="" />
              <XAxis
                type="number"
                allowDecimals={false}
                /* Ends at the largest value rather than Recharts' rounded-up
                   default, which left a third of the plot empty and made every
                   bar look shorter than it is. */
                domain={[0, 'dataMax']}
                tick={axisTick}
                stroke={GRID}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={128}
                tick={axisTick}
                stroke={GRID}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                content={({ active, payload }) => (
                  <ChartTooltip
                    active={active}
                    label={payload?.[0]?.payload?.label as string}
                    value={`${payload?.[0]?.value ?? 0} application${
                      payload?.[0]?.value === 1 ? '' : 's'
                    }`}
                  />
                )}
              />
              {/* 4px rounded data-end, anchored square to the baseline. */}
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {statusFunnel.map((entry) => (
                  <Cell
                    key={entry.status}
                    /*
                     * One colour for every bar — this is one measure, and
                     * shading bars by their own value would encode length
                     * twice. The single exception is REJECTED, which is not a
                     * stage of progress but an exit from the pipeline; greying
                     * it keeps the eye on the stages that are still live.
                     */
                    fill={entry.status === 'REJECTED' ? MUTED_SERIES : SERIES}
                  />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  className="fill-slate-500"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Match score trend" subtitle="Weekly average, last 8 weeks">
          {trendHasData ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={matchScoreTrend.map((point) => ({
                  ...point,
                  label: weekLabel(point.week),
                }))}
                margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
              >
                <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="" />
                <XAxis dataKey="label" tick={axisTick} stroke={GRID} tickLine={false} />
                {/*
                  Fixed 0–100, because the score is a percentage and the axis
                  should mean the same thing every week. Left to autoscale, a
                  run of 62–68 fills the plot and reads as violent swings.
                */}
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={axisTick}
                  stroke={GRID}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  cursor={{ stroke: GRID }}
                  content={({ active, payload }) => (
                    <ChartTooltip
                      active={active}
                      label={payload?.[0]?.payload?.label as string}
                      value={
                        payload?.[0]?.value === null || payload?.[0]?.value === undefined
                          ? 'No analyses this week'
                          : `${payload[0].value}% average match`
                      }
                    />
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  stroke={SERIES}
                  strokeWidth={2}
                  dot={{ r: 4, fill: SERIES, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                  /*
                   * A week with no completed analyses is a gap in the line,
                   * not a point at zero. Connecting across it would draw a
                   * trend through weeks where nothing happened.
                   */
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No completed analyses yet. Attach a resume to an application and the trend starts here." />
          )}
        </Card>
      </div>

      {/* -- Skill gaps ---------------------------------------------------- */}

      <Card
        title="Skills to prioritize learning"
        subtitle="How often each skill was missing across your completed analyses"
        className="mt-4"
      >
        {skillGapAggregation.length > 0 ? (
          <ResponsiveContainer
            width="100%"
            /* Sized from the row count so the axis band is always inside the
               container — a fixed height that excludes it gives the card its
               own little scrollbar. */
            height={Math.max(180, skillGapAggregation.length * 32 + 40)}
          >
            <BarChart
              data={skillGapAggregation}
              layout="vertical"
              margin={{ top: 4, right: 32, bottom: 4, left: 8 }}
              barCategoryGap={6}
            >
              <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="" />
              <XAxis
                type="number"
                allowDecimals={false}
                domain={[0, 'dataMax']}
                tick={axisTick}
                stroke={GRID}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="skill"
                width={168}
                tick={axisTick}
                stroke={GRID}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                content={({ active, payload }) => (
                  <ChartTooltip
                    active={active}
                    label={payload?.[0]?.payload?.skill as string}
                    value={`Missing from ${payload?.[0]?.value ?? 0} analys${
                      payload?.[0]?.value === 1 ? 'is' : 'es'
                    }`}
                  />
                )}
              />
              <Bar dataKey="count" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={20}>
                <LabelList
                  dataKey="count"
                  position="right"
                  className="fill-slate-500"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Once an analysis completes, the skills it finds missing are tallied here — the ones that come up most are the ones worth learning first." />
        )}
      </Card>

      {/* -- Needs attention + activity ------------------------------------ */}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Needs attention"
          subtitle="Applied, with no movement for 10 days or more"
        >
          {needsAttention.length > 0 ? (
            <ul className="space-y-2">
              {needsAttention.map((entry) => (
                <li key={entry.id}>
                  <Link
                    to={`/applications/${entry.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {entry.companyName}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {entry.jobTitle}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-xs font-medium text-amber-700">
                      {entry.daysSinceLastUpdate} days quiet
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Nothing is going stale. Every application you have applied to has moved in
              the last 10 days.
            </p>
          )}
        </Card>

        <Card title="Recent activity" subtitle="Your last 5 status changes">
          {recentActivity.length > 0 ? (
            <ol className="space-y-3">
              {recentActivity.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900">
                      <Link
                        to={`/applications/${entry.applicationId}`}
                        className="font-medium hover:underline"
                      >
                        {entry.companyName}
                      </Link>{' '}
                      <span className="text-slate-500">moved to</span>{' '}
                      {STATUS_LABELS[entry.status as ApplicationStatus]}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {entry.jobTitle} · {formatRelative(entry.changedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Status changes will show up here as you move applications along.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

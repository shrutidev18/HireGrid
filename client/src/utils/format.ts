/**
 * Display formatting helpers.
 *
 * Built on the browser's own `Intl` API rather than a date library. Date
 * handling here is limited to "show this timestamp to a human", which Intl
 * does natively — adding date-fns or dayjs would mean a dependency and a
 * bundle cost for formatting that the platform already provides. If real date
 * *arithmetic* is needed later (adding business days, timezone conversion),
 * that is the point to reconsider.
 *
 * Every function takes the ISO string the API sends, because JSON has no date
 * type — anything that was a `DateTime` in Prisma arrives here as a string.
 */

/** "11 Sep 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** "11 Sep 2026, 14:32" — used on the timeline, where the time matters. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * "3 days ago", "in 2 months".
 *
 * `Intl.RelativeTimeFormat` needs to be told which unit to use, so the value
 * is bucketed first — largest unit whose threshold the difference passes.
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return formatter.format(Math.round(seconds / secondsInUnit), unit);
    }
  }

  return 'just now';
}

/**
 * Converts an ISO timestamp to the "YYYY-MM-DD" that `<input type="date">`
 * requires. Anything else — including a full ISO string — makes the input
 * render blank with no error, which looks like data loss when editing.
 */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  // Local date parts, not `toISOString()`, which converts to UTC and can shift
  // the date by a day for users east or west of Greenwich.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

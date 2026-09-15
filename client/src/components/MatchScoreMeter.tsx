/**
 * The match score, drawn as a meter.
 *
 * A single ratio against a fixed limit is a meter, not a chart — a one-bar bar
 * chart or a two-slice pie would be more ink for the same one number. The
 * number itself is the hero; the ring is context showing where it sits between
 * 0 and 100.
 *
 * The track and the fill are steps of the *same* hue rather than a red/amber/
 * green gauge. Status colours are reserved for state (good / warning /
 * critical) and would imply a verdict the score does not carry — 55 against a
 * stretch role is not an error. A band label sits underneath so the reading is
 * never carried by colour alone.
 */
function band(score: number): string {
  if (score >= 80) return 'Strong match';
  if (score >= 60) return 'Good match';
  if (score >= 40) return 'Partial match';
  return 'Weak match';
}

export default function MatchScoreMeter({ score }: { score: number }) {
  const radius = 52;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;

  const clamped = Math.max(0, Math.min(100, score));
  const filled = (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg
          width="128"
          height="128"
          viewBox="0 0 128 128"
          role="img"
          aria-label={`Match score ${clamped} out of 100 — ${band(clamped)}`}
        >
          {/* Rotated so the fill starts at twelve o'clock rather than three. */}
          <g transform="rotate(-90 64 64)">
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-brand-100"
              strokeWidth={stroke}
            />
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-brand-600"
              strokeWidth={stroke}
              strokeDasharray={`${filled} ${circumference - filled}`}
              // Rounded data-end, anchored to the start of the track.
              strokeLinecap="round"
            />
          </g>
        </svg>

        {/* The hero number wears a text token, not the meter's colour. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
            {clamped}
          </span>
          <span className="text-xs text-slate-400">/ 100</span>
        </div>
      </div>

      <p className="mt-2 text-sm font-medium text-slate-700">{band(clamped)}</p>
    </div>
  );
}

import { getRatingColor } from '@shared/utils';
import type { ProfessorData } from '@shared/types';

function rating(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

export default function ProfessorResult({ data }: { data: ProfessorData }) {
  const plural = data.numRatings === 1 ? 'rating' : 'ratings';

  return (
    <div className="result">
      <div
        className="result__score"
        style={{ background: getRatingColor(data.overallRating) }}
        aria-hidden="true"
      >
        {data.overallRating === null ? 'N/A' : data.overallRating.toFixed(1)}
      </div>

      <div>
        <div className="result__name">{data.name}</div>
        <div className="result__meta">
          {data.department} · {data.university}
        </div>
        <div className="result__stats">
          Difficulty {rating(data.difficulty)} · Would retake {percent(data.wouldTakeAgain)} ·{' '}
          {data.numRatings} {plural}
        </div>

        {data.topTags.length > 0 && (
          <div className="result__tags">
            {data.topTags.map((tag) => (
              <span className="result__tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <a className="result__link" href={data.rmpUrl} target="_blank" rel="noopener noreferrer">
          View on RateMyProfessor →
        </a>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { sendMessage } from '@shared/messaging';
import type { ProfessorData, RecentProfessor, UsageStats } from '@shared/types';
import { getRatingColor } from '@shared/utils';
import SearchBar from '../components/SearchBar';
import ProfessorResult from '../components/ProfessorResult';

type SearchState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'found'; data: ProfessorData }
  | { status: 'missing'; name: string }
  | { status: 'failed'; message: string };

function relativeTime(then: number, now = Date.now()): string {
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export default function Status() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [recents, setRecents] = useState<RecentProfessor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  const loadUsage = useCallback(async () => {
    try {
      const reply = await sendMessage({ type: 'GET_USAGE' }, 'USAGE');
      setStats(reply.stats);
      setRecents(reply.recents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const onSearch = useCallback(async (name: string) => {
    setSearch({ status: 'busy' });
    try {
      const reply = await sendMessage({ type: 'LOOKUP_PROFESSOR', name }, 'PROFESSOR_RESULT');
      setSearch(reply.data ? { status: 'found', data: reply.data } : { status: 'missing', name });
    } catch (err) {
      setSearch({ status: 'failed', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  return (
    <div className="page">
      <SearchBar onSearch={(name) => void onSearch(name)} busy={search.status === 'busy'} />

      {search.status === 'busy' && <p className="notice">Searching RateMyProfessor…</p>}
      {search.status === 'found' && <ProfessorResult data={search.data} />}
      {search.status === 'missing' && (
        <p className="notice">
          No University of Arizona match for “{search.name}”. Try the name as it appears in UAccess.
        </p>
      )}
      {search.status === 'failed' && <p className="notice notice--error">{search.message}</p>}

      <h2 className="section-title">What this adds to UAccess</h2>
      <ul className="feature-list">
        <li>Rating badge beside every instructor in class search</li>
        <li>Click a badge for difficulty, retake rate and per-course ratings</li>
        <li>Filter sections by instructor rating</li>
        <li>Sidebar ranking every instructor on the page</li>
      </ul>

      {recents.length > 0 && (
        <>
          <h2 className="section-title">Recently viewed</h2>
          <ul className="recents">
            {recents.map((r) => (
              <li key={r.name} className="recent">
                <span
                  className="recent__score"
                  style={{ background: getRatingColor(r.overallRating) }}
                >
                  {r.overallRating === null ? 'N/A' : r.overallRating.toFixed(1)}
                </span>
                <span className="recent__meta">
                  <a href={r.rmpUrl} target="_blank" rel="noopener noreferrer">
                    {r.name}
                  </a>
                  <span className="recent__sub">
                    {r.department} · {relativeTime(r.viewedAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {stats !== null && stats.lookups > 0 && (
        <p className="tally">
          {stats.badgesShown} badges shown · {stats.matches} matched · {stats.misses} not on RMP
          {stats.errors > 0 && ` · ${stats.errors} failed`}
        </p>
      )}

      {error && <p className="notice notice--error">{error}</p>}
    </div>
  );
}

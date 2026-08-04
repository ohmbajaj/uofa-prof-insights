import { useCallback, useEffect, useState } from 'react';
import { sendMessage } from '@shared/messaging';
import type { ProfessorData } from '@shared/types';
import SearchBar from '../components/SearchBar';
import ProfessorResult from '../components/ProfessorResult';

interface CacheStats {
  count: number;
  oldestAge: number;
}

/** Whole days, since the cache TTL is expressed in days. */
function formatAge(ms: number): string {
  if (ms <= 0) return '—';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'found'; data: ProfessorData }
  | { status: 'missing'; name: string }
  | { status: 'failed'; message: string };

export default function Status() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  const loadStats = useCallback(async () => {
    try {
      const reply = await sendMessage({ type: 'GET_CACHE_STATS' }, 'CACHE_STATS');
      setStats(reply.stats);
      setStatsError(null);
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const onSearch = useCallback(async (name: string) => {
    setSearch({ status: 'busy' });
    try {
      const reply = await sendMessage({ type: 'LOOKUP_PROFESSOR', name }, 'PROFESSOR_RESULT');
      setSearch(reply.data ? { status: 'found', data: reply.data } : { status: 'missing', name });
    } catch (error) {
      setSearch({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const onClear = useCallback(async () => {
    setClearing(true);
    try {
      await sendMessage({ type: 'CLEAR_CACHE' }, 'CACHE_CLEARED');
      setStats({ count: 0, oldestAge: 0 });
      setStatsError(null);
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : String(error));
    } finally {
      setClearing(false);
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

      <h2 className="field__label" style={{ marginTop: 18, marginBottom: 6 }}>
        Cache
      </h2>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat__value">{stats ? stats.count : '—'}</div>
          <div className="stat__label">Professors cached</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats ? formatAge(stats.oldestAge) : '—'}</div>
          <div className="stat__label">Oldest entry</div>
        </div>
      </div>

      {statsError && <p className="notice notice--error">{statsError}</p>}

      <button
        className="btn btn--danger"
        type="button"
        onClick={() => void onClear()}
        disabled={clearing || stats?.count === 0}
      >
        {clearing ? 'Clearing…' : 'Clear cache'}
      </button>
    </div>
  );
}

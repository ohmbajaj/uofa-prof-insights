import { useCallback, useEffect, useState } from 'react';
import { MAX_CACHE_TTL_DAYS, MIN_CACHE_TTL_DAYS } from '@shared/constants';
import { sendMessage } from '@shared/messaging';
import type { ExtensionSettings } from '@shared/types';
import { formatDuration } from '@shared/utils';
import Diagnostics from '../components/Diagnostics';

export default function Settings() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [cacheStats, setCacheStats] = useState<{ count: number; oldestAge: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadCacheStats = useCallback(async () => {
    try {
      const reply = await sendMessage({ type: 'GET_CACHE_STATS' }, 'CACHE_STATS');
      setCacheStats(reply.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const clearCache = useCallback(async () => {
    setBusy(true);
    try {
      await sendMessage({ type: 'CLEAR_CACHE' }, 'CACHE_CLEARED');
      setCacheStats({ count: 0, oldestAge: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const clearUsage = useCallback(async () => {
    setBusy(true);
    try {
      await sendMessage({ type: 'CLEAR_USAGE' }, 'USAGE');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const reply = await sendMessage({ type: 'GET_SETTINGS' }, 'SETTINGS');
        setSettings(reply.settings);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    void loadCacheStats();
  }, [loadCacheStats]);

  const save = useCallback(async (patch: Partial<ExtensionSettings>) => {
    // Optimistic: the toggle should feel instant, and a failure re-renders
    // from the authoritative reply anyway.
    setSettings((current) => (current ? { ...current, ...patch } : current));
    try {
      const reply = await sendMessage({ type: 'SAVE_SETTINGS', settings: patch }, 'SETTINGS');
      setSettings(reply.settings);
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  if (error && !settings) {
    return (
      <div className="page">
        <p className="notice notice--error">{error}</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="page">
        <p className="notice">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="field">
        <input
          id="autoDetect"
          type="checkbox"
          checked={settings.autoDetect}
          onChange={(e) => void save({ autoDetect: e.target.checked })}
        />
        <div className="field__text">
          <label className="field__label" htmlFor="autoDetect">
            Show ratings automatically
          </label>
          <div className="field__hint">
            Adds a rating badge next to every instructor in class search. Turn off to leave UAccess
            untouched and use the search box instead.
          </div>
        </div>
      </div>

      <div className="field">
        <input
          id="showFilterBar"
          type="checkbox"
          checked={settings.showFilterBar}
          onChange={(e) => void save({ showFilterBar: e.target.checked })}
        />
        <div className="field__text">
          <label className="field__label" htmlFor="showFilterBar">
            Show rating filter
          </label>
          <div className="field__hint">
            Adds controls above the results for hiding sections whose instructor falls below a
            rating you choose.
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field__text">
          <label className="field__label" htmlFor="cacheTTLDays">
            Keep ratings for
          </label>
          <div className="field__hint">
            How long a professor stays cached before being fetched again.
          </div>
        </div>
        <div>
          <input
            id="cacheTTLDays"
            type="number"
            className="searchbar__input"
            style={{ width: 68 }}
            min={MIN_CACHE_TTL_DAYS}
            max={MAX_CACHE_TTL_DAYS}
            value={settings.cacheTTLDays}
            onChange={(e) => {
              const days = Number(e.target.value);
              if (Number.isFinite(days)) void save({ cacheTTLDays: days });
            }}
          />{' '}
          days
        </div>
      </div>

      <h2 className="section-title">Stored data</h2>
      <p className="field__hint" style={{ marginBottom: 8 }}>
        Ratings and usage counts live only in this browser and are never sent anywhere.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat__value">{cacheStats ? cacheStats.count : 'N/A'}</div>
          <div className="stat__label">Professors cached</div>
        </div>
        <div className="stat">
          <div className="stat__value">
            {cacheStats ? formatDuration(cacheStats.oldestAge) : 'N/A'}
          </div>
          <div className="stat__label">Oldest entry</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn--danger"
          type="button"
          onClick={() => void clearCache()}
          disabled={busy || cacheStats?.count === 0}
        >
          Clear cache
        </button>
        <button className="btn" type="button" onClick={() => void clearUsage()} disabled={busy}>
          Clear history
        </button>
      </div>

      <Diagnostics />

      {error && <p className="notice notice--error">{error}</p>}
      <p className="notice" hidden={!saved} role="status">
        Saved
      </p>
    </div>
  );
}

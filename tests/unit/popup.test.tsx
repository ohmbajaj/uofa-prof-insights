import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IncomingMessage, OutgoingMessage } from '@shared/messages';
import type { RecentProfessor } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';
import App from '@popup/App';
import Status from '@popup/pages/Status';
import Settings from '@popup/pages/Settings';
import ProfessorResult from '@popup/components/ProfessorResult';
import { makeProfessor } from '../helpers/chrome-mock';

/** Routes each outgoing message type to a canned reply. */
function installRuntime(
  handlers: Partial<Record<OutgoingMessage['type'], () => Promise<IncomingMessage>>>,
) {
  const sendMessage = vi.fn(async (message: OutgoingMessage) => {
    const handler = handlers[message.type];
    if (!handler) throw new Error(`unhandled test message: ${message.type}`);
    return handler();
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  return sendMessage;
}

const stats = (count: number, oldestAge = 0): IncomingMessage => ({
  type: 'CACHE_STATS',
  stats: { count, oldestAge },
});

const EMPTY_USAGE = {
  lookups: 0,
  matches: 0,
  misses: 0,
  errors: 0,
  cacheHits: 0,
  badgesShown: 0,
  since: 0,
};

const usage = (
  patch: Partial<typeof EMPTY_USAGE> = {},
  recents: RecentProfessor[] = [],
): IncomingMessage => ({
  type: 'USAGE',
  stats: { ...EMPTY_USAGE, ...patch },
  recents,
});

function recent(patch: Partial<RecentProfessor> = {}): RecentProfessor {
  return {
    name: 'Rick Mercer',
    department: 'Computer Science',
    overallRating: 2.9,
    numRatings: 164,
    rmpUrl: 'https://www.ratemyprofessors.com/professor/12302',
    viewedAt: Date.now() - 3 * 60_000,
    ...patch,
  };
}

beforeEach(() => {
  vi.stubGlobal('__APP_VERSION__', '1.0.0');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('opens on the Status tab', async () => {
    installRuntime({
      GET_USAGE: async () => usage(),
    });
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Status' })).toHaveProperty('ariaSelected', 'true');
    await waitFor(() => expect(screen.getByLabelText('Professor name')).toBeTruthy());
  });

  it('switches to Settings', async () => {
    installRuntime({
      GET_USAGE: async () => usage(),
      GET_CACHE_STATS: async () => stats(0),
      GET_SETTINGS: async () => ({ type: 'SETTINGS', settings: { ...DEFAULT_SETTINGS } }),
    });
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));

    await waitFor(() => expect(screen.getByLabelText('Show ratings automatically')).toBeTruthy());
  });

  it('shows the manifest version', () => {
    installRuntime({ GET_USAGE: async () => usage() });
    render(<App />);
    expect(screen.getByText('v1.0.0')).toBeTruthy();
  });
});

describe('Status page', () => {
  it('explains what the extension adds to UAccess', async () => {
    installRuntime({ GET_USAGE: async () => usage() });
    render(<Status />);

    await waitFor(() => expect(screen.getByText(/What this adds to UAccess/i)).toBeTruthy());
    expect(screen.getByText(/Filter sections by instructor rating/i)).toBeTruthy();
  });

  it('lists recently viewed professors', async () => {
    installRuntime({
      GET_USAGE: async () =>
        usage({ lookups: 5 }, [recent(), recent({ name: 'Saumya Debray', overallRating: 3.4 })]),
    });
    render(<Status />);

    await waitFor(() => expect(screen.getByText('Rick Mercer')).toBeTruthy());
    expect(screen.getByText('Saumya Debray')).toBeTruthy();
    expect(screen.getByText('2.9')).toBeTruthy();
  });

  it('hides the recents section when there is nothing to show', async () => {
    installRuntime({ GET_USAGE: async () => usage() });
    render(<Status />);

    await waitFor(() => expect(screen.getByText(/What this adds/i)).toBeTruthy());
    expect(screen.queryByText(/Recently viewed/i)).toBeNull();
  });

  it('shows a usage tally once there has been activity', async () => {
    installRuntime({
      GET_USAGE: async () => usage({ lookups: 30, matches: 22, misses: 8, badgesShown: 30 }),
    });
    render(<Status />);

    await waitFor(() => expect(screen.getByText(/30 badges shown/)).toBeTruthy());
    expect(screen.getByText(/22 matched/)).toBeTruthy();
    expect(screen.getByText(/8 not on RMP/)).toBeTruthy();
  });

  it('omits the tally before any lookups', async () => {
    installRuntime({ GET_USAGE: async () => usage() });
    render(<Status />);

    await waitFor(() => expect(screen.getByText(/What this adds/i)).toBeTruthy());
    expect(screen.queryByText(/badges shown/)).toBeNull();
  });

  it('reports a usage failure without breaking the page', async () => {
    installRuntime({
      GET_USAGE: async () => ({ type: 'ERROR', message: 'worker asleep' }),
    });
    render(<Status />);

    await waitFor(() => expect(screen.getByText('worker asleep')).toBeTruthy());
    // The search box still works.
    expect(screen.getByLabelText('Professor name')).toBeTruthy();
  });

  it('searches and renders a found professor', async () => {
    installRuntime({
      GET_USAGE: async () => usage(),
      LOOKUP_PROFESSOR: async () => ({
        type: 'PROFESSOR_RESULT',
        name: 'Richard Mercer',
        data: makeProfessor({ name: 'Richard Mercer', overallRating: 2.9, numRatings: 164 }),
      }),
    });
    render(<Status />);

    fireEvent.change(screen.getByLabelText('Professor name'), {
      target: { value: 'Richard Mercer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('Richard Mercer')).toBeTruthy());
    expect(screen.getByText(/164 ratings/)).toBeTruthy();
  });

  it('explains a miss rather than showing an empty card', async () => {
    installRuntime({
      GET_USAGE: async () => usage(),
      LOOKUP_PROFESSOR: async () => ({ type: 'PROFESSOR_RESULT', name: 'Nobody', data: null }),
    });
    render(<Status />);

    fireEvent.change(screen.getByLabelText('Professor name'), { target: { value: 'Nobody' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText(/No University of Arizona match/)).toBeTruthy());
  });

  it('surfaces a search failure', async () => {
    installRuntime({
      GET_USAGE: async () => usage(),
      LOOKUP_PROFESSOR: async () => ({ type: 'ERROR', message: 'RMP unreachable' }),
    });
    render(<Status />);

    fireEvent.change(screen.getByLabelText('Professor name'), { target: { value: 'Anyone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('RMP unreachable')).toBeTruthy());
  });

  it('will not search an empty box', async () => {
    installRuntime({ GET_USAGE: async () => usage() });
    render(<Status />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Search' })).toHaveProperty('disabled', true);
  });

  it('keeps cache controls off the Status screen', async () => {
    installRuntime({ GET_USAGE: async () => usage({ lookups: 3 }) });
    render(<Status />);

    await waitFor(() => expect(screen.getByText(/What this adds/i)).toBeTruthy());
    // Cache is maintenance, and lives in Settings.
    expect(screen.queryByRole('button', { name: 'Clear cache' })).toBeNull();
    expect(screen.queryByText(/Professors cached/i)).toBeNull();
  });
});

describe('Settings page', () => {
  it('renders stored settings', async () => {
    installRuntime({
      GET_SETTINGS: async () => ({
        type: 'SETTINGS',
        settings: {
          autoDetect: false,
          showFilterBar: true,
          cacheTTLDays: 14,
        },
      }),
    });
    render(<Settings />);

    await waitFor(() =>
      expect(screen.getByLabelText('Show ratings automatically')).toHaveProperty('checked', false),
    );
    expect(screen.getByLabelText('Show rating filter')).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Keep ratings for')).toHaveProperty('value', '14');
  });

  it('saves a toggle change', async () => {
    const send = installRuntime({
      GET_SETTINGS: async () => ({ type: 'SETTINGS', settings: { ...DEFAULT_SETTINGS } }),
      GET_CACHE_STATS: async () => stats(0),
      SAVE_SETTINGS: async () => ({
        type: 'SETTINGS',
        settings: { ...DEFAULT_SETTINGS, autoDetect: false },
      }),
    });
    render(<Settings />);

    await waitFor(() => expect(screen.getByLabelText('Show ratings automatically')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Show ratings automatically'));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        type: 'SAVE_SETTINGS',
        settings: { autoDetect: false },
      }),
    );
  });

  it('saves a TTL change', async () => {
    const send = installRuntime({
      GET_SETTINGS: async () => ({ type: 'SETTINGS', settings: { ...DEFAULT_SETTINGS } }),
      GET_CACHE_STATS: async () => stats(0),
      SAVE_SETTINGS: async () => ({
        type: 'SETTINGS',
        settings: { ...DEFAULT_SETTINGS, cacheTTLDays: 30 },
      }),
    });
    render(<Settings />);

    await waitFor(() => expect(screen.getByLabelText('Keep ratings for')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Keep ratings for'), { target: { value: '30' } });

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({ type: 'SAVE_SETTINGS', settings: { cacheTTLDays: 30 } }),
    );
  });

  it('surfaces a load failure', async () => {
    installRuntime({ GET_SETTINGS: async () => ({ type: 'ERROR', message: 'storage broken' }) });
    render(<Settings />);

    await waitFor(() => expect(screen.getByText('storage broken')).toBeTruthy());
  });

  it('reports a save failure', async () => {
    installRuntime({
      GET_SETTINGS: async () => ({ type: 'SETTINGS', settings: { ...DEFAULT_SETTINGS } }),
      GET_CACHE_STATS: async () => stats(0),
      SAVE_SETTINGS: async () => ({ type: 'ERROR', message: 'could not save' }),
    });
    render(<Settings />);

    await waitFor(() => expect(screen.getByLabelText('Show rating filter')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Show rating filter'));

    await waitFor(() => expect(screen.getByText('could not save')).toBeTruthy());
  });
});

describe('ProfessorResult', () => {
  it('renders the full record', () => {
    render(
      <ProfessorResult
        data={makeProfessor({
          name: 'Richard Mercer',
          department: 'Computer Science',
          overallRating: 2.9,
          difficulty: 3.4,
          wouldTakeAgain: 48.6,
          numRatings: 164,
          topTags: ['Lecture heavy'],
        })}
      />,
    );

    expect(screen.getByText('Richard Mercer')).toBeTruthy();
    expect(screen.getByText(/Computer Science/)).toBeTruthy();
    expect(screen.getByText(/Difficulty 3.4/)).toBeTruthy();
    expect(screen.getByText(/49%/)).toBeTruthy();
    expect(screen.getByText('Lecture heavy')).toBeTruthy();
  });

  it('shows N/A and dashes for an unrated professor', () => {
    render(
      <ProfessorResult
        data={makeProfessor({
          overallRating: null,
          difficulty: null,
          wouldTakeAgain: null,
          numRatings: 0,
          topTags: [],
        })}
      />,
    );

    expect(screen.getByText('N/A')).toBeTruthy();
    expect(screen.getByText(/Difficulty N\/A/)).toBeTruthy();
  });

  it('links to RMP safely', () => {
    render(<ProfessorResult data={makeProfessor()} />);
    const link = screen.getByRole('link') as HTMLAnchorElement;

    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });
});

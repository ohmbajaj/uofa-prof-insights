import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IncomingMessage, OutgoingMessage } from '@shared/messages';
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
      GET_CACHE_STATS: async () => stats(0),
    });
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Status' })).toHaveProperty('ariaSelected', 'true');
    await waitFor(() => expect(screen.getByLabelText('Professor name')).toBeTruthy());
  });

  it('switches to Settings', async () => {
    installRuntime({
      GET_CACHE_STATS: async () => stats(0),
      GET_SETTINGS: async () => ({ type: 'SETTINGS', settings: { ...DEFAULT_SETTINGS } }),
    });
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));

    await waitFor(() => expect(screen.getByLabelText('Show ratings automatically')).toBeTruthy());
  });

  it('shows the manifest version', () => {
    installRuntime({ GET_CACHE_STATS: async () => stats(0) });
    render(<App />);
    expect(screen.getByText('v1.0.0')).toBeTruthy();
  });
});

describe('Status page', () => {
  it('shows cache statistics', async () => {
    installRuntime({ GET_CACHE_STATS: async () => stats(42, 3 * 86_400_000) });
    render(<Status />);

    await waitFor(() => expect(screen.getByText('42')).toBeTruthy());
    expect(screen.getByText('3d')).toBeTruthy();
  });

  it('reports a stats failure without breaking the page', async () => {
    installRuntime({
      GET_CACHE_STATS: async () => ({ type: 'ERROR', message: 'worker asleep' }),
    });
    render(<Status />);

    await waitFor(() => expect(screen.getByText('worker asleep')).toBeTruthy());
  });

  it('searches and renders a found professor', async () => {
    installRuntime({
      GET_CACHE_STATS: async () => stats(1),
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
      GET_CACHE_STATS: async () => stats(0),
      LOOKUP_PROFESSOR: async () => ({ type: 'PROFESSOR_RESULT', name: 'Nobody', data: null }),
    });
    render(<Status />);

    fireEvent.change(screen.getByLabelText('Professor name'), { target: { value: 'Nobody' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText(/No University of Arizona match/)).toBeTruthy());
  });

  it('surfaces a search failure', async () => {
    installRuntime({
      GET_CACHE_STATS: async () => stats(0),
      LOOKUP_PROFESSOR: async () => ({ type: 'ERROR', message: 'RMP unreachable' }),
    });
    render(<Status />);

    fireEvent.change(screen.getByLabelText('Professor name'), { target: { value: 'Anyone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('RMP unreachable')).toBeTruthy());
  });

  it('will not search an empty box', async () => {
    installRuntime({ GET_CACHE_STATS: async () => stats(0) });
    render(<Status />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Search' })).toHaveProperty('disabled', true);
  });

  it('clears the cache and zeroes the counter', async () => {
    const send = installRuntime({
      GET_CACHE_STATS: async () => stats(42),
      CLEAR_CACHE: async () => ({ type: 'CACHE_CLEARED' }),
    });
    render(<Status />);

    await waitFor(() => expect(screen.getByText('42')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Clear cache' }));

    await waitFor(() => expect(screen.getByText('0')).toBeTruthy());
    expect(send).toHaveBeenCalledWith({ type: 'CLEAR_CACHE' });
  });

  it('disables Clear cache when nothing is cached', async () => {
    installRuntime({ GET_CACHE_STATS: async () => stats(0) });
    render(<Status />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear cache' })).toHaveProperty('disabled', true),
    );
  });
});

describe('Settings page', () => {
  it('renders stored settings', async () => {
    installRuntime({
      GET_SETTINGS: async () => ({
        type: 'SETTINGS',
        settings: { autoDetect: false, showComparison: true, cacheTTLDays: 14 },
      }),
    });
    render(<Settings />);

    await waitFor(() =>
      expect(screen.getByLabelText('Show ratings automatically')).toHaveProperty('checked', false),
    );
    expect(screen.getByLabelText('Show comparison sidebar')).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Keep ratings for')).toHaveProperty('value', '14');
  });

  it('saves a toggle change', async () => {
    const send = installRuntime({
      GET_SETTINGS: async () => ({ type: 'SETTINGS', settings: { ...DEFAULT_SETTINGS } }),
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
      SAVE_SETTINGS: async () => ({ type: 'ERROR', message: 'could not save' }),
    });
    render(<Settings />);

    await waitFor(() => expect(screen.getByLabelText('Show comparison sidebar')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Show comparison sidebar'));

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
    expect(screen.getByText(/Difficulty —/)).toBeTruthy();
  });

  it('links to RMP safely', () => {
    render(<ProfessorResult data={makeProfessor()} />);
    const link = screen.getByRole('link') as HTMLAnchorElement;

    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });
});

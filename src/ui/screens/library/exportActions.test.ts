import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockChordRecords, mockKeyRecords, mockSession } from '@/core/mocks';
import type { SessionFull } from '@/data';
import { shareChart } from './exportActions';

const full = (): SessionFull => ({
  session: mockSession({ id: 's', name: 'Evening idea in C' }),
  chords: mockChordRecords('s', 1),
  keys: mockKeyRecords('s'),
  markers: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shareChart', () => {
  it('opens the system share sheet with the title and the text chart', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share });
    expect(await shareChart(full())).toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'Evening idea in C',
      text: expect.stringContaining('Key: C major'),
    });
  });

  it('treats a dismissed share sheet as cancelled, not as an error', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('dismissed', 'AbortError'));
    vi.stubGlobal('navigator', { ...navigator, share });
    expect(await shareChart(full())).toBe('cancelled');
  });

  it('copies the chart when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareChart(full())).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^Evening idea in C — /));
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadApp } from './reloadApp';

const reload = vi.fn();
function setup(waiting: { postMessage: (message: unknown) => void } | null) {
  const worker = new EventTarget();
  const getRegistration = vi.fn().mockResolvedValue({ waiting });
  vi.stubGlobal('navigator', { serviceWorker: Object.assign(worker, { getRegistration }) });
  vi.stubGlobal('window', { location: { reload } });
  return { worker, getRegistration };
}

describe('explicit app reload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reloads normally when there is no waiting update', async () => {
    setup(null);
    await reloadApp();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('waits for the new worker before reloading', async () => {
    const postMessage = vi.fn();
    const { worker } = setup({ postMessage });
    const pending = reloadApp();
    await Promise.resolve();
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    worker.dispatchEvent(new Event('controllerchange'));
    await pending;
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not hang if the worker never responds', async () => {
    vi.useFakeTimers();
    setup({ postMessage: vi.fn() });
    const pending = reloadApp();
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(reload).toHaveBeenCalledOnce();
  });

  it('still reloads if service-worker access is unavailable', async () => {
    const { getRegistration } = setup(null);
    getRegistration.mockRejectedValue(new Error('Storage unavailable'));
    await reloadApp();
    expect(reload).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createEmitter } from './events';

describe('createEmitter', () => {
  it('delivers to subscribers and unsubscribes', () => {
    const e = createEmitter<number>();
    const a = vi.fn();
    const off = e.subscribe(a);
    e.emit(1);
    off();
    e.emit(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(1);
  });

  it('isolates a throwing listener', () => {
    const e = createEmitter<string>();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    e.subscribe(() => {
      throw new Error('boom');
    });
    e.subscribe(good);
    e.emit('x');
    expect(good).toHaveBeenCalledWith('x');
    spy.mockRestore();
  });
});

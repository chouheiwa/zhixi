import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomDelay } from '@/shared/utils';

describe('randomDelay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a Promise', () => {
    const result = randomDelay(100, 200);
    expect(result).toBeInstanceOf(Promise);
    // Advance timers to prevent unresolved promise hanging
    vi.runAllTimers();
  });

  it('resolves after the delay has elapsed', async () => {
    let resolved = false;
    const promise = randomDelay(100, 200).then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    // Advance past the maximum possible delay
    vi.advanceTimersByTime(200);

    await promise;
    expect(resolved).toBe(true);
  });

  it('does not resolve before the minimum delay', async () => {
    let resolved = false;
    const promise = randomDelay(500, 1000).then(() => {
      resolved = true;
    });

    // Advance less than the minimum delay
    vi.advanceTimersByTime(499);
    // Flush microtasks without advancing timers further
    await Promise.resolve();

    expect(resolved).toBe(false);

    // Now advance past the maximum
    vi.advanceTimersByTime(501);
    await promise;
    expect(resolved).toBe(true);
  });
});

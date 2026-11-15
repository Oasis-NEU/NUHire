import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trailingThrottle } from './throttle';

// The teacher's Manage Groups board reloads on every student signup. A class
// of 30 signing in at once used to reload it 30 times; this is what holds it to
// one reload per window while still showing the last student to join.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('trailingThrottle', () => {
  it('folds a burst of triggers into one call after the window', () => {
    const fn = vi.fn();
    const throttle = trailingThrottle(fn, 1500);

    for (let i = 0; i < 30; i++) {
      throttle.trigger();
      vi.advanceTimersByTime(30);
    }
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps calling through a steady trickle, never twice within the window', () => {
    const calls: number[] = [];
    const throttle = trailingThrottle(() => calls.push(Date.now()), 1500);

    for (let t = 0; t < 10_000; t += 500) {
      throttle.trigger();
      vi.advanceTimersByTime(500);
    }
    const lastTrigger = Date.now() - 500;
    vi.advanceTimersByTime(1500);

    expect(calls.length).toBeGreaterThan(1);
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i] - calls[i - 1]).toBeGreaterThanOrEqual(1500);
    }
    expect(calls[calls.length - 1]).toBeGreaterThan(lastTrigger);
  });

  it('starts a new window for a trigger after a call', () => {
    const fn = vi.fn();
    const throttle = trailingThrottle(fn, 1500);

    throttle.trigger();
    vi.advanceTimersByTime(1500);
    throttle.trigger();
    vi.advanceTimersByTime(1499);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('drops a pending call on cancel', () => {
    const fn = vi.fn();
    const throttle = trailingThrottle(fn, 1500);

    throttle.trigger();
    throttle.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();

    throttle.trigger();
    vi.advanceTimersByTime(1500);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSSEReconnect } from '@/renderer/hooks/chat/useSSEReconnect';

describe('useSSEReconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('starts in the "idle" state with attempt 0', () => {
    const { result } = renderHook(() => useSSEReconnect(vi.fn()));
    expect(result.current.state).toBe('idle');
    expect(result.current.attempt).toBe(0);
  });

  it('transitions to "connected" and resets attempt count on onConnected', () => {
    const { result } = renderHook(() => useSSEReconnect(vi.fn()));
    act(() => {
      result.current.onConnected();
    });
    expect(result.current.state).toBe('connected');
    expect(result.current.attempt).toBe(0);
  });

  it('transitions to "reconnecting" then "connecting" after timer fires, and calls onReconnect', () => {
    const onReconnect = vi.fn();
    const { result } = renderHook(() =>
      useSSEReconnect(onReconnect, { baseDelayMs: 100, maxDelayMs: 10_000, maxAttempts: 5 })
    );

    act(() => {
      result.current.onDisconnected();
    });
    expect(result.current.state).toBe('reconnecting');

    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.state).toBe('connecting');
    expect(result.current.attempt).toBe(1);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('transitions to "failed" after reaching maxAttempts', () => {
    const onReconnect = vi.fn();
    // maxAttempts = 1: first cycle brings attempt to 1, second onDisconnected
    // sees nextAttempt (2) > maxAttempts (1) and enters 'failed'
    const { result } = renderHook(() =>
      useSSEReconnect(onReconnect, { baseDelayMs: 100, maxDelayMs: 10_000, maxAttempts: 1 })
    );

    act(() => {
      result.current.onDisconnected();
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.state).toBe('connecting');
    expect(result.current.attempt).toBe(1);

    act(() => {
      result.current.onDisconnected();
    });
    expect(result.current.state).toBe('failed');
  });

  it('reset returns to "idle" with attempt 0', () => {
    const { result } = renderHook(() =>
      useSSEReconnect(vi.fn(), { baseDelayMs: 100, maxDelayMs: 10_000, maxAttempts: 5 })
    );

    act(() => {
      result.current.onDisconnected();
    });
    expect(result.current.state).toBe('reconnecting');

    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toBe('idle');
    expect(result.current.attempt).toBe(0);
  });

  it('reset cancels the pending timer so onReconnect is not called', () => {
    const onReconnect = vi.fn();
    const { result } = renderHook(() =>
      useSSEReconnect(onReconnect, { baseDelayMs: 5000, maxDelayMs: 30_000, maxAttempts: 5 })
    );

    act(() => {
      result.current.onDisconnected();
    });
    act(() => {
      result.current.reset();
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(onReconnect).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('schedules exponentially growing delays from the hook (1000 -> 2000 -> 4000)', () => {
    const onReconnect = vi.fn();
    const baseDelayMs = 1000;
    const { result } = renderHook(() =>
      useSSEReconnect(onReconnect, { baseDelayMs, maxDelayMs: 30_000, maxAttempts: 5 })
    );

    // 1st disconnect: attempt 0 -> delay = min(1000 * 2^0, 30000) = 1000 ms
    act(() => {
      result.current.onDisconnected();
    });
    expect(result.current.state).toBe('reconnecting');
    expect(result.current.nextRetryMs).toBe(1000);

    // Fire the scheduled timer; attempt counter advances to 1.
    act(() => {
      vi.advanceTimersByTime(result.current.nextRetryMs);
    });
    expect(result.current.attempt).toBe(1);

    // 2nd disconnect: attempt 1 -> delay = min(1000 * 2^1, 30000) = 2000 ms
    act(() => {
      result.current.onDisconnected();
    });
    expect(result.current.nextRetryMs).toBe(2000);

    act(() => {
      vi.advanceTimersByTime(result.current.nextRetryMs);
    });
    expect(result.current.attempt).toBe(2);

    // 3rd disconnect: attempt 2 -> delay = min(1000 * 2^2, 30000) = 4000 ms
    act(() => {
      result.current.onDisconnected();
    });
    expect(result.current.nextRetryMs).toBe(4000);

    act(() => {
      vi.advanceTimersByTime(result.current.nextRetryMs);
    });
    expect(result.current.attempt).toBe(3);
  });
});

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SSEReconnectState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export type UseSSEReconnectOptions = {
  /** Base delay in milliseconds before the first retry. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds. Default: 30000 */
  maxDelayMs?: number;
  /** Maximum number of retry attempts before entering 'failed'. Default: 5 */
  maxAttempts?: number;
};

export type UseSSEReconnectReturn = {
  /** Current reconnection state machine state. */
  state: SSEReconnectState;
  /** Number of retry attempts made so far. */
  attempt: number;
  /**
   * Delay in milliseconds scheduled before the next retry, computed via the
   * exponential-backoff formula `min(baseDelayMs * 2^attempt, maxDelayMs)`.
   * 0 when no retry is pending.
   */
  nextRetryMs: number;
  /**
   * Call when a connection attempt succeeds. Transitions to 'connected' and
   * resets the attempt counter.
   */
  onConnected: () => void;
  /**
   * Call when a connection attempt fails. Schedules the next retry with
   * exponential back-off, or transitions to 'failed' when the attempt limit
   * is reached.
   */
  onDisconnected: () => void;
  /** Resets the state machine to 'idle' and cancels any pending retry. */
  reset: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Exponential-backoff reconnection state manager for SSE connections.
 *
 * State transitions:
 *   idle -> connecting -> connected
 *   idle -> reconnecting -> connecting (repeat on failure) -> failed
 *
 * Delay formula: min(baseDelayMs * 2^attempt, maxDelayMs)
 *
 * @param onReconnect - Called each time the hook triggers a reconnection attempt.
 * @param options     - Optional configuration overrides.
 */
export function useSSEReconnect(onReconnect: () => void, options?: UseSSEReconnectOptions): UseSSEReconnectReturn {
  const {
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options ?? {};

  const [state, setState] = useState<SSEReconnectState>('idle');
  const [attempt, setAttempt] = useState(0);
  const [nextRetryMs, setNextRetryMs] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const onReconnectRef = useRef(onReconnect);

  // Keep the callback ref up to date without resetting side-effects.
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    attemptRef.current = 0;
    setAttempt(0);
    setNextRetryMs(0);
    setState('idle');
  }, [clearTimer]);

  const onConnected = useCallback(() => {
    clearTimer();
    attemptRef.current = 0;
    setAttempt(0);
    setNextRetryMs(0);
    setState('connected');
  }, [clearTimer]);

  const onDisconnected = useCallback(() => {
    const nextAttempt = attemptRef.current + 1;

    if (nextAttempt > maxAttempts) {
      clearTimer();
      setState('failed');
      return;
    }

    const delay = Math.min(baseDelayMs * Math.pow(2, attemptRef.current), maxDelayMs);

    setNextRetryMs(delay);
    setState('reconnecting');

    timerRef.current = setTimeout(() => {
      attemptRef.current = nextAttempt;
      setAttempt(nextAttempt);
      setState('connecting');
      onReconnectRef.current();
    }, delay);
  }, [baseDelayMs, clearTimer, maxAttempts, maxDelayMs]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { state, attempt, nextRetryMs, onConnected, onDisconnected, reset };
}

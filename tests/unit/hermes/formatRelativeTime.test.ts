/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '@/renderer/utils/time/formatRelativeTime';

function futureMs(ms: number): string {
  return new globalThis.Date(new globalThis.Date().getTime() + ms).toISOString();
}
function pastMs(ms: number): string {
  return new globalThis.Date(new globalThis.Date().getTime() - ms).toISOString();
}

describe('formatRelativeTime', () => {
  it('returns empty string for undefined', () => {
    expect(formatRelativeTime(undefined)).toBe('');
  });

  it('returns original string for invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
  });

  it('returns "in a moment" for 30s in the future', () => {
    expect(formatRelativeTime(futureMs(30_000))).toBe('in a moment');
  });

  it('returns "just now" for 30s in the past', () => {
    expect(formatRelativeTime(pastMs(30_000))).toBe('just now');
  });

  it('returns the exact "in 5 minutes" for 5 future minutes', () => {
    expect(formatRelativeTime(futureMs(5 * 60_000))).toBe('in 5 minutes');
  });

  it('returns the exact "10 minutes ago" for 10 past minutes', () => {
    expect(formatRelativeTime(pastMs(10 * 60_000))).toBe('10 minutes ago');
  });

  it('returns the exact "in 3 hours" for 3 future hours', () => {
    expect(formatRelativeTime(futureMs(3 * 3_600_000))).toBe('in 3 hours');
  });

  it('returns "tomorrow" for 24h in the future', () => {
    expect(formatRelativeTime(futureMs(24 * 3_600_000 + 60_000))).toBe('tomorrow');
  });

  it('returns "yesterday" for 24h in the past', () => {
    expect(formatRelativeTime(pastMs(24 * 3_600_000 + 60_000))).toBe('yesterday');
  });

  it('returns the exact "in 5 days" for 5 future days', () => {
    expect(formatRelativeTime(futureMs(5 * 86_400_000))).toBe('in 5 days');
  });

  it('falls back to locale string for > 7 days', () => {
    const far = futureMs(60 * 86_400_000);
    const result = formatRelativeTime(far);
    expect(result).not.toMatch(/^in \d+/);
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts numeric ms timestamp', () => {
    const futureTs = new globalThis.Date().getTime() + 2 * 60_000;
    const result = formatRelativeTime(futureTs);
    expect(result).toMatch(/^in \d+ minutes?$/);
  });
});

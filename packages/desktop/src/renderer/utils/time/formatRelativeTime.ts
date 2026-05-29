/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Returns the current wall-clock time in ms. */
export function getWallClockNow(): number {
  return new globalThis.Date().getTime();
}

/**
 * Returns a human-readable relative-time string for a future or past date string.
 * Falls back to toLocaleString() for dates more than 7 days away.
 * Tooltip-ready: use the result as the main label, pass the absolute date as tooltip content.
 */
export function formatRelativeTime(isoOrMs: string | number | undefined): string {
  if (!isoOrMs) return '';
  const ms = typeof isoOrMs === 'number' ? isoOrMs : globalThis.Date.parse(isoOrMs);
  if (Number.isNaN(ms)) return String(isoOrMs);

  const diffMs = ms - getWallClockNow();
  const absDiff = Math.abs(diffMs);
  const isFuture = diffMs > 0;
  const prefix = isFuture ? 'in ' : '';
  const suffix = isFuture ? '' : ' ago';

  if (absDiff < 45_000) return isFuture ? 'in a moment' : 'just now';
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return prefix + mins + (mins === 1 ? ' minute' : ' minutes') + suffix;
  }
  if (absDiff < 86_400_000) {
    const hours = Math.round(absDiff / 3_600_000);
    return prefix + hours + (hours === 1 ? ' hour' : ' hours') + suffix;
  }
  if (absDiff < 7 * 86_400_000) {
    const days = Math.round(absDiff / 86_400_000);
    if (days === 1) return isFuture ? 'tomorrow' : 'yesterday';
    return prefix + days + ' days' + suffix;
  }
  return new globalThis.Date(ms).toLocaleString();
}

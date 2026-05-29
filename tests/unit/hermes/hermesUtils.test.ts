/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isOpenRouterFreeTier } from '@/renderer/utils/model/disambiguateModels';
import { computeUsageSnapshot } from '@/renderer/pages/settings/HermesSettings/InsightsPanel';

// Inline copy of the formatDateTime helper to test its logic independently
function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

describe('formatDateTime', () => {
  it('returns empty string for undefined', () => {
    expect(formatDateTime(undefined)).toBe('');
  });

  it('returns original string for invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });

  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDateTime('2024-01-15T10:30:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Result should not be the raw ISO string (it was formatted)
    expect(result).not.toBe('2024-01-15T10:30:00.000Z');
  });
});

describe('isOpenRouterFreeTier', () => {
  it('identifies free-tier models', () => {
    expect(isOpenRouterFreeTier('meta-llama/llama-3-8b:free')).toBe(true);
  });

  it('rejects non-free models', () => {
    expect(isOpenRouterFreeTier('openai/gpt-4')).toBe(false);
  });
});

describe('computeUsageSnapshot', () => {
  it('returns empty array for conversations without token data', () => {
    const conversations = [{ id: '1', name: 'c1', type: 'acp' as const, extra: {} }] as Parameters<
      typeof computeUsageSnapshot
    >[0];
    expect(computeUsageSnapshot(conversations)).toEqual([]);
  });

  it('groups by date and model', () => {
    const conversations = [
      {
        id: '1',
        name: 'c1',
        type: 'acp' as const,
        created_at: 1700000000000,
        extra: {
          token_usage: { input_tokens: 100, output_tokens: 50, estimated_cost_usd: 0.01 },
          model: 'gpt-4',
        },
      },
    ] as Parameters<typeof computeUsageSnapshot>[0];
    const result = computeUsageSnapshot(conversations);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].byModel.length).toBe(1);
    expect(result[0].byModel[0].model).toBe('gpt-4');
    expect(result[0].byModel[0].inputTokens).toBe(100);
  });

  it('aggregates tokens for same date + model', () => {
    const base = { type: 'acp' as const, created_at: 1700000000000 };
    const conversations = [
      {
        ...base,
        id: '1',
        name: 'c1',
        extra: { token_usage: { input_tokens: 100, output_tokens: 50 }, model: 'gpt-4' },
      },
      {
        ...base,
        id: '2',
        name: 'c2',
        extra: { token_usage: { input_tokens: 200, output_tokens: 80 }, model: 'gpt-4' },
      },
    ] as Parameters<typeof computeUsageSnapshot>[0];
    const result = computeUsageSnapshot(conversations);
    const entry = result[0].byModel.find((m) => m.model === 'gpt-4');
    expect(entry?.inputTokens).toBe(300);
    expect(entry?.outputTokens).toBe(130);
  });
});

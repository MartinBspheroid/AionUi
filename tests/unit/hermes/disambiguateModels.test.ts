/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  disambiguateModelLabels,
  isOpenRouterFreeTier,
  makeModelFilter,
} from '@/renderer/utils/model/disambiguateModels';

describe('disambiguateModelLabels', () => {
  it('leaves unique-label models unchanged', () => {
    const models = [
      { id: 'a', name: 'GPT-4', provider: 'openai' },
      { id: 'b', name: 'Claude', provider: 'anthropic' },
    ];
    const result = disambiguateModelLabels(
      models,
      (m) => m.name,
      (m) => m.provider,
      (m, label) => ({ ...m, name: label })
    );
    expect(result[0].name).toBe('GPT-4');
    expect(result[1].name).toBe('Claude');
  });

  it('appends provider suffix for duplicate labels', () => {
    const models = [
      { id: 'a', name: 'Llama-3', provider: 'openrouter' },
      { id: 'b', name: 'Llama-3', provider: 'together' },
    ];
    const result = disambiguateModelLabels(
      models,
      (m) => m.name,
      (m) => m.provider,
      (m, label) => ({ ...m, name: label })
    );
    expect(result[0].name).toBe('Llama-3 (openrouter)');
    expect(result[1].name).toBe('Llama-3 (together)');
  });

  it('handles empty array', () => {
    type M = { id: string; name: string; provider: string };
    const result = disambiguateModelLabels<M>(
      [],
      (m) => m.name,
      (m) => m.provider,
      (m, l) => ({ ...m, name: l })
    );
    expect(result).toEqual([]);
  });

  it('does not mutate original objects', () => {
    const original = { id: 'a', name: 'Model', provider: 'p1' };
    const models = [original, { id: 'b', name: 'Model', provider: 'p2' }];
    disambiguateModelLabels(
      models,
      (m) => m.name,
      (m) => m.provider,
      (m, label) => ({ ...m, name: label })
    );
    expect(original.name).toBe('Model');
  });

  it('handles three duplicates', () => {
    const models = [
      { id: 'a', name: 'X', provider: 'p1' },
      { id: 'b', name: 'X', provider: 'p2' },
      { id: 'c', name: 'X', provider: 'p3' },
    ];
    const result = disambiguateModelLabels(
      models,
      (m) => m.name,
      (m) => m.provider,
      (m, label) => ({ ...m, name: label })
    );
    expect(result.every((m) => m.name.startsWith('X ('))).toBe(true);
    expect(new Set(result.map((m) => m.name)).size).toBe(3);
  });
});

describe('isOpenRouterFreeTier', () => {
  it('returns true for :free suffix', () => {
    expect(isOpenRouterFreeTier('meta-llama/llama-3:free')).toBe(true);
    expect(isOpenRouterFreeTier('model:free')).toBe(true);
  });

  it('returns false without :free suffix', () => {
    expect(isOpenRouterFreeTier('gpt-4')).toBe(false);
    expect(isOpenRouterFreeTier('gpt-4:pro')).toBe(false);
    expect(isOpenRouterFreeTier('')).toBe(false);
  });
});

describe('makeModelFilter', () => {
  it('includes free-tier when flag is true', () => {
    const filter = makeModelFilter(true);
    expect(filter('model:free')).toBe(true);
    expect(filter('model')).toBe(true);
  });

  it('excludes free-tier when flag is false', () => {
    const filter = makeModelFilter(false);
    expect(filter('model:free')).toBe(false);
    expect(filter('model')).toBe(true);
  });

  it('returns a new function each call', () => {
    expect(makeModelFilter(true)).toBeTypeOf('function');
    expect(makeModelFilter(false)).toBeTypeOf('function');
  });
});

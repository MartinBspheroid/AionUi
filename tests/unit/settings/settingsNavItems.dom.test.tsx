/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression guard: every id in BUILTIN_TAB_IDS (SettingsSider) must have a
 * matching entry in SettingsPageWrapper's builtinMap. A divergence (e.g. adding
 * 'hermes' to BUILTIN_TAB_IDS without adding it to builtinMap) previously injected
 * `undefined` into the nav list and crashed every settings page with
 * "Cannot read properties of undefined (reading 'id')".
 */

import { describe, expect, it } from 'vitest';
import { getBuiltinSettingsNavItems } from '@/renderer/pages/settings/components/SettingsPageWrapper';
import { BUILTIN_TAB_IDS } from '@/renderer/pages/settings/components/SettingsSider';

const t = (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key;

describe('getBuiltinSettingsNavItems', () => {
  for (const isDesktop of [true, false]) {
    describe(`isDesktop=${isDesktop}`, () => {
      const items = getBuiltinSettingsNavItems(isDesktop, t);

      it('returns no undefined / malformed entries', () => {
        for (const item of items) {
          expect(item).toBeTruthy();
          expect(typeof item.id).toBe('string');
          expect(typeof item.path).toBe('string');
          expect(item.icon).toBeTruthy();
        }
      });

      it('covers every BUILTIN_TAB_IDS id (no list divergence)', () => {
        const ids = items.map((i) => i.id);
        for (const id of BUILTIN_TAB_IDS) {
          expect(ids).toContain(id);
        }
      });

      it('includes the hermes tab', () => {
        expect(items.map((i) => i.id)).toContain('hermes');
      });
    });
  }
});

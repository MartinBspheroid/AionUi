/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type HermesMemorySectionKey = 'user' | 'memory';

type SectionState = {
  draft: string;
  saved: string;
  mtime?: string;
  saving: boolean;
};

const EMPTY_SECTION: SectionState = { draft: '', saved: '', mtime: undefined, saving: false };

export function useHermesMemory() {
  const { t } = useTranslation();
  const [user, setUser] = useState<SectionState>(EMPTY_SECTION);
  const [memory, setMemory] = useState<SectionState>(EMPTY_SECTION);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await ipcBridge.acpConversation.hermesExt.getMemory.invoke();
      setUser({ draft: next.user, saved: next.user, mtime: next.user_mtime, saving: false });
      setMemory({ draft: next.memory, saved: next.memory, mtime: next.memory_mtime, saving: false });
      setUnsupported(false);
    } catch (loadError) {
      if (isBackendHttpError(loadError) && loadError.status === 404) {
        setUnsupported(true);
        setUser(EMPTY_SECTION);
        setMemory(EMPTY_SECTION);
        return;
      }
      setError(t('settings.hermes.memory.loadError'));
      Message.error(t('settings.hermes.memory.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSection = useCallback(
    async (section: HermesMemorySectionKey) => {
      const current = section === 'user' ? user : memory;
      const setter = section === 'user' ? setUser : setMemory;
      setter({ ...current, saving: true });
      setError(null);
      try {
        await ipcBridge.acpConversation.hermesExt.setMemory.invoke(
          section === 'user' ? { user: current.draft } : { memory: current.draft }
        );
        // Reload to pick up the fresh mtime from disk.
        const next = await ipcBridge.acpConversation.hermesExt.getMemory.invoke();
        setUser({ draft: next.user, saved: next.user, mtime: next.user_mtime, saving: false });
        setMemory({ draft: next.memory, saved: next.memory, mtime: next.memory_mtime, saving: false });
        Message.success(t('settings.hermes.memory.saveSuccess'));
      } catch {
        setError(t('settings.hermes.memory.saveError'));
        Message.error(t('settings.hermes.memory.saveError'));
        setter({ ...current, saving: false });
      }
    },
    [user, memory, t]
  );

  const setUserDraft = useCallback((value: string) => setUser((prev) => ({ ...prev, draft: value })), []);
  const setMemoryDraft = useCallback((value: string) => setMemory((prev) => ({ ...prev, draft: value })), []);

  return {
    error,
    loading,
    memory: {
      draft: memory.draft,
      isDirty: memory.draft !== memory.saved,
      mtime: memory.mtime,
      saving: memory.saving,
      setDraft: setMemoryDraft,
      save: () => saveSection('memory'),
    },
    reload: load,
    unsupported,
    user: {
      draft: user.draft,
      isDirty: user.draft !== user.saved,
      mtime: user.mtime,
      saving: user.saving,
      setDraft: setUserDraft,
      save: () => saveSection('user'),
    },
  };
}

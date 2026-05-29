/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hook for loading and editing the two Hermes memory files:
 *   - USER section  → USER.md
 *   - MEMORY section → MEMORY.md
 *
 * On 404 the endpoint is considered unsupported (non-Hermes agent or older
 * aioncore version) and `unsupported` is set to `true`.
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Per-section state
// ---------------------------------------------------------------------------

type SectionState = {
  draft: string;
  saved: string;
  mtime: string | undefined;
  saving: boolean;
};

const initialSection = (): SectionState => ({
  draft: '',
  saved: '',
  mtime: undefined,
  saving: false,
});

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

type MemorySectionHandle = {
  draft: string;
  isDirty: boolean;
  mtime: string | undefined;
  saving: boolean;
  setDraft: (value: string) => void;
  save: () => Promise<void>;
};

type UseHermesMemoryResult = {
  loading: boolean;
  error: string | null;
  unsupported: boolean;
  reload: () => Promise<void>;
  user: MemorySectionHandle;
  memory: MemorySectionHandle;
};

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useHermesMemory(): UseHermesMemoryResult {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const [userState, setUserState] = useState<SectionState>(initialSection);
  const [memoryState, setMemoryState] = useState<SectionState>(initialSection);

  // -------------------------------------------------------------------------
  // Load / reload
  // -------------------------------------------------------------------------

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ipcBridge.acpConversation.hermesExt.getMemory.invoke();
      setUserState({
        draft: data.user,
        saved: data.user,
        mtime: data.user_mtime,
        saving: false,
      });
      setMemoryState({
        draft: data.memory,
        saved: data.memory,
        mtime: data.memory_mtime,
        saving: false,
      });
      setUnsupported(false);
    } catch (err) {
      if (isBackendHttpError(err) && err.status === 404) {
        setUnsupported(true);
      } else {
        setError(String(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // -------------------------------------------------------------------------
  // Save helpers
  // -------------------------------------------------------------------------

  const saveUser = useCallback(async () => {
    setUserState((prev) => ({ ...prev, saving: true }));
    try {
      await ipcBridge.acpConversation.hermesExt.setMemory.invoke({ user: userState.draft });
      Message.success(t('settings.hermes.memory.saveSuccess', 'Saved'));
      // Reload to refresh mtime
      await reload();
    } catch (err) {
      const msg =
        isBackendHttpError(err) && err.backendMessage
          ? err.backendMessage
          : err instanceof Error
            ? err.message
            : String(err);
      Message.error(t('settings.hermes.memory.saveError', 'Failed to save: {{msg}}', { msg }));
    } finally {
      setUserState((prev) => ({ ...prev, saving: false }));
    }
  }, [userState.draft, reload, t]);

  const saveMemory = useCallback(async () => {
    setMemoryState((prev) => ({ ...prev, saving: true }));
    try {
      await ipcBridge.acpConversation.hermesExt.setMemory.invoke({ memory: memoryState.draft });
      Message.success(t('settings.hermes.memory.saveSuccess', 'Saved'));
      // Reload to refresh mtime
      await reload();
    } catch (err) {
      const msg =
        isBackendHttpError(err) && err.backendMessage
          ? err.backendMessage
          : err instanceof Error
            ? err.message
            : String(err);
      Message.error(t('settings.hermes.memory.saveError', 'Failed to save: {{msg}}', { msg }));
    } finally {
      setMemoryState((prev) => ({ ...prev, saving: false }));
    }
  }, [memoryState.draft, reload, t]);

  // -------------------------------------------------------------------------
  // setDraft shorthands
  // -------------------------------------------------------------------------

  const setUserDraft = useCallback((value: string) => {
    setUserState((prev) => ({ ...prev, draft: value }));
  }, []);

  const setMemoryDraft = useCallback((value: string) => {
    setMemoryState((prev) => ({ ...prev, draft: value }));
  }, []);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    loading,
    error,
    unsupported,
    reload,
    user: {
      draft: userState.draft,
      isDirty: userState.draft !== userState.saved,
      mtime: userState.mtime,
      saving: userState.saving,
      setDraft: setUserDraft,
      save: saveUser,
    },
    memory: {
      draft: memoryState.draft,
      isDirty: memoryState.draft !== memoryState.saved,
      mtime: memoryState.mtime,
      saving: memoryState.saving,
      setDraft: setMemoryDraft,
      save: saveMemory,
    },
  };
}

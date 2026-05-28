/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type HermesMemoryState = {
  memory: string;
  user: string;
};

const EMPTY_MEMORY: HermesMemoryState = { memory: '', user: '' };

export function useHermesMemory() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<HermesMemoryState>(EMPTY_MEMORY);
  const [saved, setSaved] = useState<HermesMemoryState>(EMPTY_MEMORY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = useMemo(() => draft.memory !== saved.memory || draft.user !== saved.user, [draft, saved]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await ipcBridge.acpConversation.hermesExt.getMemory.invoke();
      setDraft(next);
      setSaved(next);
      setUnsupported(false);
    } catch (loadError) {
      if (isBackendHttpError(loadError) && loadError.status === 404) {
        setUnsupported(true);
        setDraft(EMPTY_MEMORY);
        setSaved(EMPTY_MEMORY);
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

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await ipcBridge.acpConversation.hermesExt.setMemory.invoke(draft);
      setSaved(draft);
      Message.success(t('settings.hermes.memory.saveSuccess'));
    } catch {
      setError(t('settings.hermes.memory.saveError'));
      Message.error(t('settings.hermes.memory.saveError'));
    } finally {
      setSaving(false);
    }
  }, [draft, t]);

  return {
    draft,
    error,
    isDirty,
    loading,
    reload: load,
    save,
    saving,
    setDraft,
    unsupported,
  };
}

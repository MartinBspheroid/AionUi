/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { ipcBridge } from '@/common';
import { useMessage } from '@/renderer/hooks/useMessage';
import { BookmarkOne } from '@icon-park/react';
import { Button, Popover, Input } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;

// ── Types ──────────────────────────────────────────────────────────────────

type Props = {
  conversation_id: string;
  className?: string;
};

// ── Component ──────────────────────────────────────────────────────────────

const HermesMemoryQuickSave: React.FC<Props> = ({ conversation_id: _conversation_id, className }) => {
  const { t } = useTranslation();
  const [message, contextHolder] = useMessage();

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const handleSave = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const current = await ipcBridge.acpConversation.hermesExt.getMemory.invoke();
      const separator = current.memory.trimEnd() ? '\n\n' : '';
      const updated = current.memory + separator + trimmed;
      await ipcBridge.acpConversation.hermesExt.setMemory.invoke({ memory: updated });
      message.success(t('settings.hermes.conversationActions.memorySaveSuccess'));
      setOpen(false);
      setNote('');
      setUnavailable(false);
    } catch (err) {
      if (isBackendHttpError(err) && err.status === 404) {
        setUnavailable(true);
      } else {
        message.error(t('settings.hermes.conversationActions.memorySaveFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const popoverContent = (
    <div className='flex flex-col gap-2' style={{ width: 260 }}>
      {unavailable ? (
        <span className='text-color-3 text-sm'>Hermes memory not available</span>
      ) : (
        <>
          <TextArea
            rows={3}
            value={note}
            onChange={(val) => setNote(val)}
            placeholder={t('settings.hermes.conversationActions.memorySavePlaceholder')}
          />
          <Button type='primary' size='small' loading={loading} disabled={!note.trim()} onClick={handleSave}>
            {t('settings.hermes.conversationActions.memorySave')}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <>
      {contextHolder}
      <Popover
        title={t('settings.hermes.conversationActions.memorySave')}
        content={popoverContent}
        trigger='click'
        popupVisible={open}
        onVisibleChange={(visible) => {
          setOpen(visible);
          if (!visible) {
            setNote('');
            setUnavailable(false);
          }
        }}
      >
        <Button className={className} type='text' size='small' icon={<BookmarkOne />} />
      </Popover>
    </>
  );
};

export default HermesMemoryQuickSave;

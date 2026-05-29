/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useHermesCapabilities } from '@/renderer/hooks/hermes/useHermesCapabilities';
import { useMessage } from '@/renderer/hooks/useMessage';
import type { HermesCheckpoint } from '@/common/types/hermes/hermesExt';
import { Button, Input, Popconfirm, Popover, Tooltip, Typography } from '@arco-design/web-react';
import { Brain, History, Redo, Share, Undo } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type TokenUsageData = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
} | null;

type Props = {
  conversation_id: string;
  running: boolean;
  tokenUsage: TokenUsageData;
  context_limit: number;
  className?: string;
};

function contextColor(pct: number): string {
  if (pct >= 80) return 'var(--color-danger-6, #f53f3f)';
  if (pct >= 60) return 'var(--color-warning-6, #ff7d00)';
  return 'var(--color-success-6, #00b42a)';
}

const CheckpointsPopoverContent: React.FC<{
  conversation_id: string;
  disabled: boolean;
}> = ({ conversation_id, disabled }) => {
  const { t } = useTranslation();
  const [checkpoints, setCheckpoints] = useState<HermesCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [message, contextHolder] = useMessage();

  useEffect(() => {
    setLoading(true);
    ipcBridge.acpConversation.hermesExt.listCheckpoints
      .invoke({ conversation_id })
      .then(setCheckpoints)
      .catch(() => setCheckpoints([]))
      .finally(() => setLoading(false));
  }, [conversation_id]);

  const restore = useCallback(
    async (id: string) => {
      setRestoringId(id);
      try {
        await ipcBridge.acpConversation.hermesExt.restoreCheckpoint.invoke({
          conversation_id,
          checkpoint_id: id,
        });
        message.success(t('settings.hermes.conversationActions.restoreSuccess'));
      } catch {
        message.error(t('settings.hermes.conversationActions.restoreFailed'));
      } finally {
        setRestoringId(null);
      }
    },
    [conversation_id, message, t]
  );

  if (loading)
    return (
      <>
        {contextHolder}
        <div className='px-8px py-4px text-12px text-t-secondary'>
          {t('common.loading', { defaultValue: 'Loading…' })}
        </div>
      </>
    );
  if (checkpoints.length === 0)
    return (
      <>
        {contextHolder}
        <div className='px-8px py-4px text-12px text-t-secondary'>
          {t('settings.hermes.conversationActions.noCheckpoints')}
        </div>
      </>
    );

  return (
    <>
      {contextHolder}
      <div className='flex flex-col gap-4px min-w-200px max-h-280px overflow-y-auto'>
        {checkpoints.map((cp) => (
          <div key={cp.id} className='flex items-center justify-between gap-8px px-4px py-4px rounded hover:bg-2'>
            <div className='min-w-0'>
              <Typography.Text className='text-12px block' ellipsis>
                {cp.label || cp.id}
              </Typography.Text>
              {cp.timestamp ? (
                <Typography.Text type='secondary' className='text-11px'>
                  {new globalThis.Date(cp.timestamp).toLocaleString()}
                </Typography.Text>
              ) : null}
            </div>
            <Button
              size='mini'
              type='primary'
              loading={restoringId === cp.id}
              disabled={disabled}
              onClick={() => void restore(cp.id)}
            >
              {t('settings.hermes.conversationActions.restoreCheckpoint')}
            </Button>
          </div>
        ))}
      </div>
    </>
  );
};

export const HermesActionStrip: React.FC<Props> = ({
  conversation_id,
  running,
  tokenUsage,
  context_limit,
  className = '',
}) => {
  const { t } = useTranslation();
  const { capabilities, unsupported } = useHermesCapabilities(conversation_id);
  const [message, contextHolder] = useMessage();
  const navigate = useNavigate();
  const [compressing, setCompressing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [forking, setForking] = useState(false);
  const [focusTopic, setFocusTopic] = useState('');
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  // Don't show for non-Hermes agents
  if (unsupported || !capabilities) return null;
  const hasAny =
    capabilities.compress ||
    capabilities.retry ||
    capabilities.undo ||
    capabilities.forkSession ||
    capabilities.rollback;
  // Show the strip if there is at least one action OR a context bar to display.
  if (!hasAny && context_limit === 0) return null;

  const disabled = running;

  const totalTokens = tokenUsage?.total_tokens ?? 0;
  const contextPct = context_limit > 0 ? Math.min(100, (totalTokens / context_limit) * 100) : 0;

  const handleCompress = async () => {
    setCompressing(true);
    try {
      await ipcBridge.acpConversation.hermesExt.compress.invoke({
        conversation_id,
        focus: focusTopic.trim() || undefined,
      });
      setFocusTopic('');
      message.success(t('settings.hermes.conversationActions.compress'));
    } catch {
      message.error(t('settings.hermes.conversationActions.compressFailed'));
    } finally {
      if (mountedRef.current) setCompressing(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await ipcBridge.acpConversation.hermesExt.retry.invoke({ conversation_id });
    } catch {
      message.error(t('settings.hermes.conversationActions.retryFailed'));
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  };

  const handleUndo = async () => {
    setUndoing(true);
    try {
      await ipcBridge.acpConversation.hermesExt.undo.invoke({ conversation_id });
    } catch {
      message.error(t('settings.hermes.conversationActions.undoFailed'));
    } finally {
      if (mountedRef.current) setUndoing(false);
    }
  };

  const handleFork = async () => {
    setForking(true);
    try {
      const result = await ipcBridge.acpConversation.hermesExt.forkSession.invoke({ conversation_id });
      void navigate(`/conversation/${result.session_id}`);
    } catch {
      message.error(t('settings.hermes.conversationActions.forkFailed'));
    } finally {
      if (mountedRef.current) setForking(false);
    }
  };

  return (
    <>
      {contextHolder}
      <div className={`flex flex-col gap-0 ${className}`}>
        <div className='flex items-center gap-2px py-3px px-2px'>
          {capabilities.compress && (
            <Popconfirm
              title={t('settings.hermes.conversationActions.compressHint')}
              content={
                <Input
                  size='small'
                  placeholder={t('settings.hermes.conversationActions.compressFocusPlaceholder')}
                  value={focusTopic}
                  onChange={setFocusTopic}
                />
              }
              okText={t('settings.hermes.conversationActions.compressConfirm')}
              onOk={() => void handleCompress()}
              disabled={disabled}
            >
              <Button size='mini' type='text' icon={<Brain size={13} />} loading={compressing} disabled={disabled}>
                {t('settings.hermes.conversationActions.compress')}
              </Button>
            </Popconfirm>
          )}
          {capabilities.retry && (
            <Tooltip content={t('settings.hermes.conversationActions.retryHint')}>
              <Button
                size='mini'
                type='text'
                icon={<Redo size={13} />}
                loading={retrying}
                disabled={disabled}
                onClick={() => void handleRetry()}
              >
                {t('settings.hermes.conversationActions.retry')}
              </Button>
            </Tooltip>
          )}
          {capabilities.undo && (
            <Popconfirm
              title={t('settings.hermes.conversationActions.undoHint')}
              onOk={() => void handleUndo()}
              disabled={disabled}
            >
              <Button size='mini' type='text' icon={<Undo size={13} />} loading={undoing} disabled={disabled}>
                {t('settings.hermes.conversationActions.undo')}
              </Button>
            </Popconfirm>
          )}
          {capabilities.forkSession && (
            <Tooltip content={t('settings.hermes.conversationActions.forkHint')}>
              <Button
                size='mini'
                type='text'
                icon={<Share size={13} />}
                loading={forking}
                disabled={disabled}
                onClick={() => void handleFork()}
              >
                {t('settings.hermes.conversationActions.fork')}
              </Button>
            </Tooltip>
          )}
          {capabilities.rollback && (
            <Popover
              content={<CheckpointsPopoverContent conversation_id={conversation_id} disabled={disabled} />}
              trigger='click'
              title={t('settings.hermes.conversationActions.checkpoints')}
            >
              <Tooltip content={t('settings.hermes.conversationActions.checkpointsHint')}>
                <Button size='mini' type='text' icon={<History size={13} />} disabled={disabled}>
                  {t('settings.hermes.conversationActions.checkpoints')}
                </Button>
              </Tooltip>
            </Popover>
          )}
          {context_limit > 0 && contextPct >= 50 && (
            <Tooltip content={t('settings.hermes.conversationActions.contextUsage', { pct: Math.round(contextPct) })}>
              <span className='ml-auto text-11px text-t-tertiary font-mono shrink-0'>{Math.round(contextPct)}%</span>
            </Tooltip>
          )}
        </div>
        {context_limit > 0 && (
          <div
            className='h-1px w-full rounded-full'
            style={{
              background: `linear-gradient(to right, ${contextColor(contextPct)} ${contextPct}%, var(--color-border-1, #e5e6e8) ${contextPct}%)`,
            }}
          />
        )}
      </div>
    </>
  );
};

export default HermesActionStrip;

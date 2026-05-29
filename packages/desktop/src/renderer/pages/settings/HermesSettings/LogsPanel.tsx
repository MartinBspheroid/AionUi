/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LogsPanel — Live log stream viewer for Hermes / Main process logs.
 *
 * Subscribes to the app.logStream IPC emitter and displays a ring-buffer of
 * the last 500 entries with level/tag/text filters, pause/clear/copy controls,
 * and auto-scroll to bottom.
 */

import type { HermesLogEntry } from '@/common/types/hermes/hermesExt';
import { application } from '@/common/adapter/ipcBridge';
import { Button, Input, Select, Tag, Typography } from '@arco-design/web-react';
import { Copy, Delete, PauseOne, PlayOne } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelHeader, SectionCard } from './components';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RING_CAPACITY = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// logStream emits the subset of levels that the app.logStream IPC event delivers
type StreamLevel = 'log' | 'warn' | 'error';
type LogLevel = HermesLogEntry['level'] | 'all';

type BufferedEntry = {
  level: StreamLevel;
  tag: string;
  message: string;
  data?: unknown;
  /** Monotonically-increasing sequence counter used as the display label. */
  seq: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEVEL_COLOR: Record<HermesLogEntry['level'], string> = {
  error: 'red',
  warn: 'orange',
  info: 'arcoblue',
  debug: 'gray',
  log: 'gray',
};

const LEVEL_OPTIONS: Array<{ label: string; value: LogLevel }> = [
  { label: 'All', value: 'all' },
  { label: 'Error', value: 'error' },
  { label: 'Warn', value: 'warn' },
  { label: 'Info', value: 'info' },
  { label: 'Debug', value: 'debug' },
  { label: 'Log', value: 'log' },
];

function formatSeq(seq: number): string {
  return `#${String(seq).padStart(5, '0')}`;
}

function matchesFilters(entry: BufferedEntry, level: LogLevel, text: string): boolean {
  if (level !== 'all' && entry.level !== level) return false;
  if (text) {
    const q = text.toLowerCase();
    return entry.tag.toLowerCase().includes(q) || entry.message.toLowerCase().includes(q);
  }
  return true;
}

// ---------------------------------------------------------------------------
// LogRow
// ---------------------------------------------------------------------------

type LogRowProps = {
  entry: BufferedEntry;
};

const LogRow: React.FC<LogRowProps> = ({ entry }) => (
  <div className='flex items-start gap-8px py-4px border-b border-border-primary last:border-b-0 min-h-24px'>
    <Text className='text-11px text-t-tertiary font-mono shrink-0 mt-1px w-52px'>{formatSeq(entry.seq)}</Text>
    <Tag color={LEVEL_COLOR[entry.level]} size='small' className='shrink-0 uppercase text-10px leading-none'>
      {entry.level}
    </Tag>
    <Text className='text-11px text-t-secondary font-mono shrink-0 max-w-120px truncate mt-1px'>{entry.tag}</Text>
    <Text className='text-12px text-t-primary flex-1 break-words whitespace-pre-wrap'>{entry.message}</Text>
  </div>
);

// ---------------------------------------------------------------------------
// LogsPanel
// ---------------------------------------------------------------------------

export const LogsPanel: React.FC = () => {
  const { t } = useTranslation();

  // ---- Ring buffer (mutable ref, never triggers re-render directly) ----
  const ringRef = useRef<BufferedEntry[]>([]);
  const seqRef = useRef(0);

  // ---- Displayed slice (state) ----
  const [entries, setEntries] = useState<BufferedEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all');
  const [textFilter, setTextFilter] = useState('');

  // ---- Scroll ref ----
  const bottomRef = useRef<HTMLDivElement>(null);

  // ---- Flush ring → state ----
  const flushToState = useCallback(() => {
    setEntries([...ringRef.current]);
  }, []);

  // ---- Subscribe to log stream ----
  useEffect(() => {
    const unsubscribe = application.logStream.on((raw) => {
      const seq = ++seqRef.current;
      const entry: BufferedEntry = { ...raw, seq };

      if (ringRef.current.length >= RING_CAPACITY) {
        ringRef.current.shift();
      }
      ringRef.current.push(entry);

      if (!paused) {
        flushToState();
      }
    });
    return () => unsubscribe();
  }, [paused, flushToState]);

  // ---- Auto-scroll to bottom when not paused ----
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [entries, paused]);

  // ---- Filtered view ----
  const visible = useMemo(
    () => entries.filter((e) => matchesFilters(e, levelFilter, textFilter)),
    [entries, levelFilter, textFilter]
  );

  // ---- Handlers ----
  const handlePauseToggle = useCallback(() => {
    setPaused((prev) => {
      if (prev) {
        // Resuming: flush current ring to state
        setEntries([...ringRef.current]);
      }
      return !prev;
    });
  }, []);

  const handleClear = useCallback(() => {
    ringRef.current = [];
    seqRef.current = 0;
    setEntries([]);
  }, []);

  const handleCopyAll = useCallback(() => {
    const text = visible
      .map((e) => `${formatSeq(e.seq)} [${e.level.toUpperCase()}] <${e.tag}> ${e.message}`)
      .join('\n');
    void navigator.clipboard.writeText(text);
  }, [visible]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const toolbar = (
    <div className='flex items-center gap-8px flex-wrap'>
      <Select
        size='small'
        value={levelFilter}
        onChange={(v: LogLevel) => setLevelFilter(v)}
        options={LEVEL_OPTIONS}
        style={{ width: 90 }}
        triggerProps={{ autoAlignPopupWidth: false }}
      />
      <Input
        size='small'
        placeholder={t('hermes.logs.filterPlaceholder', 'tag or message')}
        value={textFilter}
        onChange={(v: string) => setTextFilter(v)}
        allowClear
        style={{ width: 160 }}
      />
      <Button
        size='small'
        type={paused ? 'primary' : 'secondary'}
        icon={paused ? <PlayOne size={13} /> : <PauseOne size={13} />}
        onClick={handlePauseToggle}
      >
        {paused ? t('hermes.logs.resume', 'Resume') : t('hermes.logs.pause', 'Pause')}
      </Button>
      <Button size='small' type='secondary' icon={<Delete size={13} />} onClick={handleClear}>
        {t('hermes.logs.clear', 'Clear')}
      </Button>
      <Button
        size='small'
        type='secondary'
        icon={<Copy size={13} />}
        onClick={handleCopyAll}
        disabled={visible.length === 0}
      >
        {t('hermes.logs.copyAll', 'Copy All')}
      </Button>
    </div>
  );

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('hermes.logs.title', 'Logs')}
        description={t('hermes.logs.description', 'Live stream of main-process log entries (last 500).')}
        action={toolbar}
      />

      <SectionCard bodyClassName='!p-0'>
        <div className='overflow-y-auto px-12px py-8px' style={{ maxHeight: 480, minHeight: 200 }}>
          {visible.length === 0 ? (
            <div className='flex items-center justify-center py-32px'>
              <Text className='text-12px text-t-tertiary'>{t('hermes.logs.empty', 'No log entries yet.')}</Text>
            </div>
          ) : (
            visible.map((entry) => <LogRow key={entry.seq} entry={entry} />)
          )}
          <div ref={bottomRef} />
        </div>
      </SectionCard>

      {paused && (
        <div className='flex items-center justify-center'>
          <Text className='text-11px text-t-secondary'>
            {t('hermes.logs.pausedHint', 'Log stream paused — new entries are buffered.')}
          </Text>
        </div>
      )}
    </div>
  );
};

export default LogsPanel;

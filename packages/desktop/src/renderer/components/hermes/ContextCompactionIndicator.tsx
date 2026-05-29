/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Progress, Tooltip, Typography } from '@arco-design/web-react';
import React from 'react';

export type CompactionState = 'idle' | 'queued' | 'compressing' | 'done' | 'error';

type ContextCompactionIndicatorProps = {
  state: CompactionState;
  /** 0–100 percent used of context window */
  contextPercent?: number;
  /** Display message override */
  message?: string;
  className?: string;
};

const STATE_COLORS: Record<CompactionState, 'normal' | 'success' | 'error'> = {
  idle: 'normal',
  queued: 'normal',
  compressing: 'normal',
  done: 'success',
  error: 'error',
};

const STATE_LABELS: Record<CompactionState, string> = {
  idle: '',
  queued: 'Context compression queued',
  compressing: 'Compressing context…',
  done: 'Context compressed',
  error: 'Context compression failed',
};

type TextType = 'primary' | 'secondary' | 'success' | 'error' | 'warning';

function textType(state: CompactionState): TextType {
  if (state === 'error') return 'error';
  if (state === 'done') return 'success';
  return 'secondary';
}

export const ContextCompactionIndicator: React.FC<ContextCompactionIndicatorProps> = ({
  state,
  contextPercent,
  message,
  className = '',
}) => {
  if (state === 'idle') return null;

  const label = message || STATE_LABELS[state];
  const status: 'normal' | 'success' | 'error' = STATE_COLORS[state];

  return (
    <Tooltip content={label}>
      <div className={`flex items-center gap-6px ${className}`} role='status' aria-label={label}>
        {contextPercent !== undefined ? (
          <Progress type='circle' percent={contextPercent} size='mini' status={status} />
        ) : null}
        <Typography.Text type={textType(state)} className='text-12px'>
          {label}
        </Typography.Text>
      </div>
    </Tooltip>
  );
};

export default ContextCompactionIndicator;

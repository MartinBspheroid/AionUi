/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared presentational components for HermesSettings panels.
 */

import { Input, Spin, Typography } from '@arco-design/web-react';
import React from 'react';

const { Text, Title } = Typography;

// ---------------------------------------------------------------------------
// PanelHeader
// ---------------------------------------------------------------------------

type PanelHeaderProps = {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
};

export const PanelHeader: React.FC<PanelHeaderProps> = ({ title, description, action }) => (
  <div className='flex items-start justify-between gap-12px mb-16px'>
    <div className='min-w-0 flex-1'>
      <Title heading={6} className='!text-16px !font-600 !text-t-primary !mb-0'>
        {title}
      </Title>
      {description && <Text className='text-12px text-t-secondary mt-4px block'>{description}</Text>}
    </div>
    {action && <div className='shrink-0 flex items-center'>{action}</div>}
  </div>
);

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------

type SectionCardProps = {
  title?: string;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  description,
  extra,
  children,
  className,
  bodyClassName,
}) => (
  <div className={`rounded-8px border border-border-primary bg-bg-secondary ${className ?? ''}`}>
    {(title || description || extra) && (
      <div className='flex items-start justify-between gap-12px px-16px pt-14px pb-12px border-b border-border-primary'>
        <div className='min-w-0 flex-1'>
          {title && <Text className='text-13px font-600 text-t-primary block'>{title}</Text>}
          {description && <Text className='text-12px text-t-secondary mt-2px block'>{description}</Text>}
        </div>
        {extra && <div className='shrink-0 flex items-center'>{extra}</div>}
      </div>
    )}
    <div className={`px-16px py-14px ${bodyClassName ?? ''}`}>{children}</div>
  </div>
);

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, hint, valueClassName }) => (
  <div className='rounded-8px border border-border-primary bg-bg-secondary px-16px py-14px flex flex-col gap-4px'>
    <Text className='text-12px text-t-secondary'>{label}</Text>
    <span className={`text-24px font-700 text-t-primary leading-none ${valueClassName ?? ''}`}>{value}</span>
    {hint && <Text className='text-11px text-t-tertiary mt-2px'>{hint}</Text>}
  </div>
);

// ---------------------------------------------------------------------------
// InfoTile
// ---------------------------------------------------------------------------

type InfoTileProps = {
  label: string;
  value?: React.ReactNode;
};

export const InfoTile: React.FC<InfoTileProps> = ({ label, value }) => (
  <div className='flex flex-col gap-2px'>
    <Text className='text-11px text-t-tertiary uppercase tracking-wide'>{label}</Text>
    <Text className='text-13px text-t-primary font-500'>{value ?? '—'}</Text>
  </div>
);

// ---------------------------------------------------------------------------
// OutputCard
// ---------------------------------------------------------------------------

type OutputCardProps = {
  title: string;
  command?: string;
  status?: React.ReactNode;
  value: string;
  minRows?: number;
  maxRows?: number;
};

export const OutputCard: React.FC<OutputCardProps> = ({ title, command, status, value, minRows = 4, maxRows = 12 }) => (
  <SectionCard
    title={title}
    description={command ? <code className='text-11px font-mono text-t-secondary'>{command}</code> : undefined}
    extra={status}
  >
    <Input.TextArea value={value} readOnly autoSize={{ minRows, maxRows }} className='font-mono text-12px' />
  </SectionCard>
);

// ---------------------------------------------------------------------------
// PanelLoading
// ---------------------------------------------------------------------------

export const PanelLoading: React.FC = () => (
  <div className='flex items-center justify-center' style={{ minHeight: 240 }}>
    <Spin dot />
  </div>
);

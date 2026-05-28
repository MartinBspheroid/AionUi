/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Input, Spin, Typography } from '@arco-design/web-react';
import React from 'react';

const { TextArea } = Input;

type PanelHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
};

export const PanelHeader: React.FC<PanelHeaderProps> = ({ title, description, action }) => (
  <div className='flex flex-col sm:flex-row sm:items-start sm:justify-between gap-12px'>
    <div className='min-w-0'>
      <Typography.Title heading={5} className='!mt-0 !mb-4px'>
        {title}
      </Typography.Title>
      {description ? <Typography.Text type='secondary'>{description}</Typography.Text> : null}
    </div>
    {action ? <div className='flex items-center gap-8px shrink-0'>{action}</div> : null}
  </div>
);

type SectionCardProps = {
  title?: React.ReactNode;
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
  className = '',
  bodyClassName = '',
}) => (
  <section className={`rounded-12px border border-b-base bg-base p-14px min-w-0 ${className}`}>
    {title || description || extra ? (
      <div className='flex items-start justify-between gap-12px mb-12px'>
        <div className='min-w-0'>
          {title ? <Typography.Text className='font-500'>{title}</Typography.Text> : null}
          {description ? (
            <div className='mt-2px'>
              <Typography.Text type='secondary' className='text-12px'>
                {description}
              </Typography.Text>
            </div>
          ) : null}
        </div>
        {extra ? <div className='shrink-0'>{extra}</div> : null}
      </div>
    ) : null}
    <div className={bodyClassName}>{children}</div>
  </section>
);

type StatCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, hint, valueClassName = '' }) => (
  <div className='rounded-12px bg-2 p-14px min-w-0 border border-transparent'>
    <Typography.Text type='secondary' className='text-12px'>
      {label}
    </Typography.Text>
    <div className={`mt-4px text-24px leading-28px font-600 truncate ${valueClassName}`}>{value}</div>
    {hint ? (
      <div className='mt-4px'>
        <Typography.Text type='secondary' className='text-12px' ellipsis>
          {hint}
        </Typography.Text>
      </div>
    ) : null}
  </div>
);

type InfoTileProps = {
  label: React.ReactNode;
  value?: React.ReactNode;
};

export const InfoTile: React.FC<InfoTileProps> = ({ label, value }) => (
  <div className='rounded-10px bg-2 p-12px min-w-0'>
    <Typography.Text type='secondary' className='text-12px'>
      {label}
    </Typography.Text>
    <Typography.Text className='block mt-4px font-500' ellipsis>
      {value || '-'}
    </Typography.Text>
  </div>
);

type OutputCardProps = {
  title: React.ReactNode;
  command?: React.ReactNode;
  status?: React.ReactNode;
  value: string;
  minRows?: number;
  maxRows?: number;
};

export const OutputCard: React.FC<OutputCardProps> = ({ title, command, status, value, minRows = 8, maxRows = 18 }) => (
  <SectionCard
    title={title}
    description={command}
    extra={status}
    bodyClassName='[&_.arco-textarea]:font-mono [&_.arco-textarea]:text-12px'
  >
    <TextArea value={value} readOnly autoSize={{ minRows, maxRows }} />
  </SectionCard>
);

export const PanelLoading: React.FC = () => (
  <div className='h-240px flex items-center justify-center'>
    <Spin dot />
  </div>
);

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { Alert, Button, Empty, Table, Tag, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelHeader, PanelLoading, SectionCard, StatCard } from './components';

type HermesCronJobSummary = {
  id: string;
  name: string;
  enabled: boolean;
  state?: string;
  schedule_display?: string;
  schedule_kind?: string;
  schedule_expr?: string;
  repeat_completed?: number;
  repeat_times?: number | null;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  last_error?: string;
  last_delivery_error?: string;
  deliver?: string;
  script?: string;
  no_agent?: boolean;
  workdir?: string;
  model?: string;
  provider?: string;
  skills?: string[];
};

type HermesCronJobsState = {
  jobs: HermesCronJobSummary[];
  total: number;
  active: number;
  paused: number;
  errors: number;
};

function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRepeat(job: HermesCronJobSummary): string {
  if (job.repeat_times == null) return job.repeat_completed == null ? '' : `${job.repeat_completed}/∞`;
  return `${job.repeat_completed ?? 0}/${job.repeat_times}`;
}

const CronJobsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<HermesCronJobsState>({ jobs: [], total: 0, active: 0, paused: 0, errors: 0 });
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipcBridge.acpConversation.hermesExt.listCronJobs.invoke();
      setState(result);
      setUnsupported(false);
    } catch (loadError) {
      if (isBackendHttpError(loadError) && loadError.status === 404) {
        setUnsupported(true);
        setState({ jobs: [], total: 0, active: 0, paused: 0, errors: 0 });
        return;
      }
      setError(t('settings.hermes.cron.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo(
    () => [
      {
        title: t('settings.hermes.cron.columns.name'),
        dataIndex: 'name',
        render: (_value: unknown, record: HermesCronJobSummary) => (
          <div className='min-w-0 flex flex-col gap-2px'>
            <Typography.Text className='font-500' ellipsis>
              {record.name || record.id}
            </Typography.Text>
            <Typography.Text type='secondary' className='text-12px' ellipsis>
              {record.id}
            </Typography.Text>
          </div>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.status'),
        dataIndex: 'last_status',
        render: (_value: unknown, record: HermesCronJobSummary) => {
          const hasError = record.last_status === 'error' || !!record.last_error || !!record.last_delivery_error;
          if (hasError) return <Tag color='red'>{t('settings.hermes.cron.status.error')}</Tag>;
          if (!record.enabled || record.state === 'paused')
            return <Tag color='orange'>{t('settings.hermes.cron.status.paused')}</Tag>;
          return <Tag color='green'>{t('settings.hermes.cron.status.active')}</Tag>;
        },
      },
      {
        title: t('settings.hermes.cron.columns.schedule'),
        dataIndex: 'schedule_display',
        render: (_value: unknown, record: HermesCronJobSummary) => (
          <div className='min-w-0 flex flex-col gap-2px'>
            <Typography.Text ellipsis>{record.schedule_display || record.schedule_expr || '-'}</Typography.Text>
            {record.schedule_kind ? (
              <Typography.Text type='secondary' className='text-12px'>
                {record.schedule_kind}
              </Typography.Text>
            ) : null}
          </div>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.nextRun'),
        dataIndex: 'next_run_at',
        render: (value?: string) => (
          <Typography.Text type={value ? undefined : 'secondary'}>{formatDateTime(value) || '-'}</Typography.Text>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.lastRun'),
        dataIndex: 'last_run_at',
        render: (_value: unknown, record: HermesCronJobSummary) => (
          <div className='min-w-0 flex flex-col gap-2px'>
            <Typography.Text type={record.last_run_at ? undefined : 'secondary'}>
              {formatDateTime(record.last_run_at) || '-'}
            </Typography.Text>
            <Typography.Text type='secondary' className='text-12px'>
              {formatRepeat(record) || '-'}
            </Typography.Text>
          </div>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.details'),
        dataIndex: 'details',
        render: (_value: unknown, record: HermesCronJobSummary) => {
          const details = [
            record.script,
            record.no_agent ? 'no-agent' : undefined,
            record.provider,
            record.model,
            record.deliver,
          ]
            .filter(Boolean)
            .join(' · ');
          const problem = record.last_error || record.last_delivery_error;
          return (
            <div className='min-w-0 flex flex-col gap-2px'>
              <Typography.Text type={details ? undefined : 'secondary'} ellipsis>
                {details || '-'}
              </Typography.Text>
              {problem ? (
                <Typography.Text type='error' className='text-12px' ellipsis>
                  {problem}
                </Typography.Text>
              ) : null}
            </div>
          );
        },
      },
    ],
    [t]
  );

  if (loading) {
    return <PanelLoading />;
  }

  if (unsupported) {
    return (
      <Alert
        type='warning'
        title={t('settings.hermes.cron.unsupportedTitle')}
        content={t('settings.hermes.cron.unsupportedDescription')}
      />
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('settings.hermes.cron.title')}
        description={t('settings.hermes.cron.description')}
        action={
          <Button icon={<Refresh />} onClick={() => void load()}>
            {t('common.reload')}
          </Button>
        }
      />

      <div className='grid grid-cols-2 lg:grid-cols-4 gap-12px'>
        <StatCard label={t('settings.hermes.cron.summary.total')} value={state.total} />
        <StatCard
          label={t('settings.hermes.cron.summary.active')}
          value={state.active}
          valueClassName='text-success-6'
        />
        <StatCard
          label={t('settings.hermes.cron.summary.paused')}
          value={state.paused}
          valueClassName='text-warning-6'
        />
        <StatCard
          label={t('settings.hermes.cron.summary.errors')}
          value={state.errors}
          valueClassName='text-danger-6'
        />
      </div>

      {error ? <Alert type='error' content={error} /> : null}

      <SectionCard title={t('settings.hermes.cron.tabTitle')}>
        {state.jobs.length === 0 ? (
          <Empty description={t('settings.hermes.cron.empty')} />
        ) : (
          <Table rowKey='id' columns={columns} data={state.jobs} pagination={false} scroll={{ x: true }} />
        )}
      </SectionCard>
    </div>
  );
};

export default CronJobsPanel;

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

export type HermesSessionSummary = {
  id: string;
  title?: string;
  model?: string;
  platform?: string;
  session_start?: string;
  last_updated?: string;
  path?: string;
};

function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const SessionsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<HermesSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipcBridge.acpConversation.hermesExt.listSessions.invoke();
      setSessions(result.sessions);
      setUnsupported(false);
    } catch (loadError) {
      if (isBackendHttpError(loadError) && loadError.status === 404) {
        setUnsupported(true);
        setSessions([]);
        return;
      }
      setError(t('settings.hermes.sessions.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const aTime = Date.parse(a.last_updated || a.session_start || '');
        const bTime = Date.parse(b.last_updated || b.session_start || '');
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      }),
    [sessions]
  );
  const latestSession = sortedSessions[0];

  const columns = useMemo(
    () => [
      {
        title: t('settings.hermes.sessions.columns.title'),
        dataIndex: 'title',
        render: (_value: unknown, record: HermesSessionSummary) => (
          <div className='min-w-0 flex flex-col gap-2px'>
            <Typography.Text className='font-500' ellipsis>
              {record.title || record.id}
            </Typography.Text>
            <Typography.Text type='secondary' className='text-12px' ellipsis>
              {record.id}
            </Typography.Text>
          </div>
        ),
      },
      {
        title: t('settings.hermes.sessions.columns.model'),
        dataIndex: 'model',
        render: (value?: string) =>
          value ? <Tag>{value}</Tag> : <Typography.Text type='secondary'>-</Typography.Text>,
      },
      {
        title: t('settings.hermes.sessions.columns.platform'),
        dataIndex: 'platform',
        render: (value?: string) =>
          value ? <Tag color='arcoblue'>{value}</Tag> : <Typography.Text type='secondary'>-</Typography.Text>,
      },
      {
        title: t('settings.hermes.sessions.columns.lastUpdated'),
        dataIndex: 'last_updated',
        render: (value?: string) => (
          <Typography.Text type={value ? undefined : 'secondary'}>{formatDateTime(value) || '-'}</Typography.Text>
        ),
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
        title={t('settings.hermes.sessions.unsupportedTitle')}
        content={t('settings.hermes.sessions.unsupportedDescription')}
      />
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('settings.hermes.sessions.title')}
        description={t('settings.hermes.sessions.description')}
        action={
          <Button icon={<Refresh />} onClick={() => void load()}>
            {t('common.reload')}
          </Button>
        }
      />

      {error ? <Alert type='error' content={error} /> : null}

      <div className='grid grid-cols-1 md:grid-cols-3 gap-12px'>
        <StatCard label={t('settings.hermes.sessions.tabTitle')} value={sessions.length} />
        <StatCard label={t('settings.hermes.sessions.columns.model')} value={latestSession?.model || '-'} />
        <StatCard
          label={t('settings.hermes.sessions.columns.lastUpdated')}
          value={formatDateTime(latestSession?.last_updated) || '-'}
          hint={latestSession?.title || latestSession?.id}
        />
      </div>

      <SectionCard title={t('settings.hermes.sessions.tabTitle')}>
        {sortedSessions.length === 0 ? (
          <Empty description={t('settings.hermes.sessions.empty')} />
        ) : (
          <Table rowKey='id' columns={columns} data={sortedSessions} pagination={false} scroll={{ x: true }} />
        )}
      </SectionCard>
    </div>
  );
};

export default SessionsPanel;

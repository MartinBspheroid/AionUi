/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { Alert, Button, Empty, Table, Tag, Spin, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    return (
      <div className='h-240px flex items-center justify-center'>
        <Spin dot />
      </div>
    );
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
      <div className='flex flex-col sm:flex-row sm:items-start sm:justify-between gap-12px'>
        <div className='min-w-0'>
          <Typography.Title heading={5} className='!mt-0 !mb-4px'>
            {t('settings.hermes.sessions.title')}
          </Typography.Title>
          <Typography.Text type='secondary'>{t('settings.hermes.sessions.description')}</Typography.Text>
        </div>
        <Button icon={<Refresh />} onClick={() => void load()}>
          {t('common.reload')}
        </Button>
      </div>

      {error ? <Alert type='error' content={error} /> : null}

      {sessions.length === 0 ? (
        <Empty description={t('settings.hermes.sessions.empty')} />
      ) : (
        <Table rowKey='id' columns={columns} data={sessions} pagination={false} scroll={{ x: true }} />
      )}
    </div>
  );
};

export default SessionsPanel;

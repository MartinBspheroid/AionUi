/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GatewayStatusPanel — Gateway health status display for the Hermes settings tab.
 *
 * Calls ipcBridge.acpConversation.checkAgentHealth with backend='hermes' and
 * renders a status card (Healthy / Unhealthy / Unknown), latency in ms when
 * available, last-checked indicator, a Refresh button, and an error Alert.
 */

import { ipcBridge } from '@/common';
import { Alert, Button, Spin, Tag, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelHeader, SectionCard, StatCard } from './components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthResult = {
  available: boolean;
  latency?: number;
  error?: string;
};

type CheckState = 'idle' | 'loading' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a human-readable relative string from a check-index counter. */
function formatLastChecked(index: number, t: (key: string) => string): string {
  if (index === 0) return t('settings.hermes.gateway.unknown');
  return t('settings.hermes.gateway.lastCheck');
}

function StatusTag({
  state,
  result,
  t,
}: {
  state: CheckState;
  result: HealthResult | null;
  t: (key: string) => string;
}): React.ReactElement {
  if (state === 'loading') {
    return <Spin size={14} />;
  }
  if (state === 'idle' || result === null) {
    return (
      <Tag color='gray' size='small'>
        {t('settings.hermes.gateway.unknown')}
      </Tag>
    );
  }
  if (result.available) {
    return (
      <Tag color='green' size='small'>
        {t('settings.hermes.gateway.healthy')}
      </Tag>
    );
  }
  return (
    <Tag color='red' size='small'>
      {t('settings.hermes.gateway.unhealthy')}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const GatewayStatusPanel: React.FC = () => {
  const { t } = useTranslation();
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [result, setResult] = useState<HealthResult | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const runCheck = useCallback(async () => {
    cancelledRef.current = false;
    setCheckState('loading');
    setErrorMsg(null);
    try {
      const health = await ipcBridge.acpConversation.checkAgentHealth.invoke({ backend: 'hermes' });
      if (cancelledRef.current) return;
      setResult(health);
      setCheckCount((prev) => prev + 1);
      setCheckState('done');
      if (!health.available && health.error) {
        setErrorMsg(health.error);
      }
    } catch (err: unknown) {
      if (cancelledRef.current) return;
      const message = err instanceof Error ? err.message : t('settings.hermes.gateway.checkFailed');
      setErrorMsg(message);
      setCheckState('error');
    }
  }, [t]);

  useEffect(() => {
    void runCheck();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoading = checkState === 'loading';

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('settings.hermes.gateway.title')}
        description={t('settings.hermes.gateway.description')}
        action={
          <Button
            icon={<Refresh />}
            loading={isLoading}
            onClick={() => {
              void runCheck();
            }}
          >
            {t('settings.hermes.gateway.refresh')}
          </Button>
        }
      />

      {errorMsg ? <Alert type='error' content={errorMsg} closable /> : null}

      <div className='grid grid-cols-1 md:grid-cols-3 gap-12px'>
        <StatCard
          label={t('settings.hermes.gateway.status')}
          value={<StatusTag state={checkState} result={result} t={t} />}
        />

        <StatCard
          label={t('settings.hermes.gateway.latency')}
          value={
            result?.latency !== undefined ? (
              <span>{result.latency} ms</span>
            ) : (
              <Typography.Text type='secondary'>—</Typography.Text>
            )
          }
        />

        <StatCard
          label={t('settings.hermes.gateway.lastCheck')}
          value={
            checkCount > 0 ? (
              <Typography.Text>just now</Typography.Text>
            ) : (
              <Typography.Text type='secondary'>{formatLastChecked(checkCount, t)}</Typography.Text>
            )
          }
          hint={checkCount > 0 ? `#${checkCount}` : undefined}
        />
      </div>

      <SectionCard title={t('settings.hermes.gateway.status')}>
        <div className='flex flex-col gap-8px'>
          {isLoading ? (
            <div className='flex items-center gap-8px'>
              <Spin size={16} />
              <Typography.Text type='secondary' className='text-13px'>
                {t('settings.hermes.gateway.refresh')}...
              </Typography.Text>
            </div>
          ) : (
            <div className='flex items-center gap-12px'>
              <StatusTag state={checkState} result={result} t={t} />
              {result?.latency !== undefined && (
                <Typography.Text className='text-13px text-t-secondary'>{result.latency} ms</Typography.Text>
              )}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default GatewayStatusPanel;

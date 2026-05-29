/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tabs } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import CliConfigPanel from './CliConfigPanel';

// Panels that will be implemented alongside this container.
// They are imported here so that routing wires them once they exist.
const MemoryPanel = React.lazy(() => import('./MemoryPanel'));
const SessionsPanel = React.lazy(() => import('./SessionsPanel'));
const SkillsPanel = React.lazy(() => import('./SkillsPanel'));
const CronPanel = React.lazy(() => import('./CronJobsPanel'));
const LogsPanel = React.lazy(() => import('./LogsPanel'));
const InsightsPanel = React.lazy(() => import('./InsightsPanel'));
const GatewayStatusPanel = React.lazy(() => import('./GatewayStatusPanel'));

type HermesTab = 'memory' | 'sessions' | 'skills' | 'cron' | 'cli' | 'logs' | 'insights' | 'gateway';

const VALID_TABS: HermesTab[] = ['memory', 'sessions', 'skills', 'cron', 'cli', 'logs', 'insights', 'gateway'];

function isHermesTab(value: string | null): value is HermesTab {
  return VALID_TABS.includes(value as HermesTab);
}

const HermesSettings: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<HermesTab>(() => {
    const param = searchParams.get('tab');
    return isHermesTab(param) ? param : 'memory';
  });

  useEffect(() => {
    const param = searchParams.get('tab');
    if (isHermesTab(param) && param !== activeTab) {
      setActiveTab(param);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (key: string) => {
    if (isHermesTab(key)) {
      setActiveTab(key);
      const next = new URLSearchParams(searchParams);
      next.set('tab', key);
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <Tabs
        activeTab={activeTab}
        onChange={handleTabChange}
        type='line'
        className='flex flex-col flex-1 min-h-0 [&>.arco-tabs-content]:pt-0'
      >
        <Tabs.TabPane key='memory' title={t('settings.hermes.memory.tabTitle')}>
          <React.Suspense fallback={null}>
            <MemoryPanel />
          </React.Suspense>
        </Tabs.TabPane>

        <Tabs.TabPane key='sessions' title={t('settings.hermes.sessions.tabTitle')}>
          <React.Suspense fallback={null}>
            <SessionsPanel />
          </React.Suspense>
        </Tabs.TabPane>

        <Tabs.TabPane key='skills' title={t('settings.hermes.skills.tabTitle')}>
          <React.Suspense fallback={null}>
            <SkillsPanel />
          </React.Suspense>
        </Tabs.TabPane>

        <Tabs.TabPane key='cron' title={t('settings.hermes.cron.tabTitle')}>
          <React.Suspense fallback={null}>
            <CronPanel />
          </React.Suspense>
        </Tabs.TabPane>

        <Tabs.TabPane key='cli' title={t('settings.hermes.cli.tabTitle')}>
          <CliConfigPanel />
        </Tabs.TabPane>

        <Tabs.TabPane key='logs' title={t('settings.hermes.logs.tabTitle')}>
          <React.Suspense fallback={null}>
            <LogsPanel />
          </React.Suspense>
        </Tabs.TabPane>

        <Tabs.TabPane key='insights' title={t('settings.hermes.insights.tabTitle')}>
          <React.Suspense fallback={null}>
            <InsightsPanel />
          </React.Suspense>
        </Tabs.TabPane>

        <Tabs.TabPane key='gateway' title={t('settings.hermes.gateway.tabTitle')}>
          <React.Suspense fallback={null}>
            <GatewayStatusPanel />
          </React.Suspense>
        </Tabs.TabPane>
      </Tabs>
    </SettingsPageWrapper>
  );
};

export default HermesSettings;

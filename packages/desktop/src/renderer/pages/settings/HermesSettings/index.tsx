/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tabs } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import CliConfigPanel from './CliConfigPanel';
import CronJobsPanel from './CronJobsPanel';
import MemoryPanel from './MemoryPanel';
import SessionsPanel from './SessionsPanel';
import SkillsPanel from './SkillsPanel';

const HermesSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <Tabs type='line' defaultActiveTab='memory' className='flex flex-col flex-1 min-h-0 [&>.arco-tabs-content]:pt-0'>
        <Tabs.TabPane key='memory' title={t('settings.hermes.memory.tabTitle')}>
          <MemoryPanel />
        </Tabs.TabPane>
        <Tabs.TabPane key='sessions' title={t('settings.hermes.sessions.tabTitle')}>
          <SessionsPanel />
        </Tabs.TabPane>
        <Tabs.TabPane key='skills' title={t('settings.hermes.skills.tabTitle')}>
          <SkillsPanel />
        </Tabs.TabPane>
        <Tabs.TabPane key='cron' title={t('settings.hermes.cron.tabTitle')}>
          <CronJobsPanel />
        </Tabs.TabPane>
        <Tabs.TabPane key='cli' title={t('settings.hermes.cli.tabTitle')}>
          <CliConfigPanel />
        </Tabs.TabPane>
      </Tabs>
    </SettingsPageWrapper>
  );
};

export default HermesSettings;

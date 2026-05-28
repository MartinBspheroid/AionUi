/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tabs } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import MemoryPanel from './MemoryPanel';

const HermesSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <Tabs type='line' activeTab='memory' className='flex flex-col flex-1 min-h-0 [&>.arco-tabs-content]:pt-0'>
        <Tabs.TabPane key='memory' title={t('settings.hermes.memory.tabTitle')}>
          <MemoryPanel />
        </Tabs.TabPane>
      </Tabs>
    </SettingsPageWrapper>
  );
};

export default HermesSettings;

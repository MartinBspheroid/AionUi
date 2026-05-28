/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Input, Typography } from '@arco-design/web-react';
import { Refresh, Save } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { PanelHeader, PanelLoading, SectionCard } from './components';
import { useHermesMemory } from './useHermesMemory';

const { TextArea } = Input;

const MemoryPanel: React.FC = () => {
  const { t } = useTranslation();
  const { draft, error, isDirty, loading, reload, save, saving, setDraft, unsupported } = useHermesMemory();

  if (loading) {
    return <PanelLoading />;
  }

  if (unsupported) {
    return (
      <Alert
        type='warning'
        title={t('settings.hermes.memory.unsupportedTitle')}
        content={t('settings.hermes.memory.unsupportedDescription')}
      />
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('settings.hermes.memory.title')}
        description={t('settings.hermes.memory.description')}
        action={
          <>
            <Button icon={<Refresh />} onClick={() => void reload()} disabled={saving}>
              {t('common.reload')}
            </Button>
            <Button type='primary' icon={<Save />} loading={saving} disabled={!isDirty} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </>
        }
      />

      {error ? <Alert type='error' content={error} /> : null}

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-16px'>
        <SectionCard title={t('settings.hermes.memory.memoryLabel')}>
          <label className='flex flex-col gap-8px min-w-0 [&_.arco-textarea]:font-mono [&_.arco-textarea]:text-12px'>
            <Typography.Text type='secondary' className='text-12px'>
              {t('settings.hermes.memory.memoryPlaceholder')}
            </Typography.Text>
            <TextArea
              value={draft.memory}
              onChange={(memory) => setDraft((prev) => ({ ...prev, memory }))}
              autoSize={{ minRows: 18, maxRows: 28 }}
              placeholder={t('settings.hermes.memory.memoryPlaceholder')}
            />
          </label>
        </SectionCard>
        <SectionCard title={t('settings.hermes.memory.userLabel')}>
          <label className='flex flex-col gap-8px min-w-0 [&_.arco-textarea]:font-mono [&_.arco-textarea]:text-12px'>
            <Typography.Text type='secondary' className='text-12px'>
              {t('settings.hermes.memory.userPlaceholder')}
            </Typography.Text>
            <TextArea
              value={draft.user}
              onChange={(user) => setDraft((prev) => ({ ...prev, user }))}
              autoSize={{ minRows: 18, maxRows: 28 }}
              placeholder={t('settings.hermes.memory.userPlaceholder')}
            />
          </label>
        </SectionCard>
      </div>
    </div>
  );
};

export default MemoryPanel;

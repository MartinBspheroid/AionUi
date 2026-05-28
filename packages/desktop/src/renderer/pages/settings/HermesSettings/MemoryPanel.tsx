/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Input, Spin, Typography } from '@arco-design/web-react';
import { Refresh, Save } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHermesMemory } from './useHermesMemory';

const { TextArea } = Input;

const MemoryPanel: React.FC = () => {
  const { t } = useTranslation();
  const { draft, error, isDirty, loading, reload, save, saving, setDraft, unsupported } = useHermesMemory();

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
        title={t('settings.hermes.memory.unsupportedTitle')}
        content={t('settings.hermes.memory.unsupportedDescription')}
      />
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex items-start justify-between gap-12px'>
        <div className='min-w-0'>
          <Typography.Title heading={5} className='!mt-0 !mb-4px'>
            {t('settings.hermes.memory.title')}
          </Typography.Title>
          <Typography.Text type='secondary'>{t('settings.hermes.memory.description')}</Typography.Text>
        </div>
        <div className='flex items-center gap-8px shrink-0'>
          <Button icon={<Refresh />} onClick={() => void reload()} disabled={saving}>
            {t('common.reload')}
          </Button>
          <Button type='primary' icon={<Save />} loading={saving} disabled={!isDirty} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </div>
      </div>

      {error ? <Alert type='error' content={error} /> : null}

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-16px'>
        <label className='flex flex-col gap-8px min-w-0'>
          <Typography.Text className='font-500'>{t('settings.hermes.memory.memoryLabel')}</Typography.Text>
          <TextArea
            value={draft.memory}
            onChange={(memory) => setDraft((prev) => ({ ...prev, memory }))}
            autoSize={{ minRows: 18, maxRows: 28 }}
            placeholder={t('settings.hermes.memory.memoryPlaceholder')}
          />
        </label>
        <label className='flex flex-col gap-8px min-w-0'>
          <Typography.Text className='font-500'>{t('settings.hermes.memory.userLabel')}</Typography.Text>
          <TextArea
            value={draft.user}
            onChange={(user) => setDraft((prev) => ({ ...prev, user }))}
            autoSize={{ minRows: 18, maxRows: 28 }}
            placeholder={t('settings.hermes.memory.userPlaceholder')}
          />
        </label>
      </div>
    </div>
  );
};

export default MemoryPanel;

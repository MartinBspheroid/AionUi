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

function formatMtime(mtime: string | undefined): string {
  if (!mtime) return '';
  const date = new Date(mtime);
  return Number.isNaN(date.getTime()) ? mtime : date.toLocaleString();
}

type SectionEditorProps = {
  title: string;
  description: string;
  placeholder: string;
  draft: string;
  isDirty: boolean;
  saving: boolean;
  mtime?: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saveLabel: string;
  mtimeLabel: string;
};

const SectionEditor: React.FC<SectionEditorProps> = ({
  title,
  description,
  placeholder,
  draft,
  isDirty,
  saving,
  mtime,
  onChange,
  onSave,
  saveLabel,
  mtimeLabel,
}) => {
  const formattedMtime = formatMtime(mtime);
  return (
    <SectionCard
      title={title}
      extra={
        <Button type='primary' size='small' icon={<Save />} loading={saving} disabled={!isDirty} onClick={onSave}>
          {saveLabel}
        </Button>
      }
    >
      <label className='flex flex-col gap-8px min-w-0 [&_.arco-textarea]:font-mono [&_.arco-textarea]:text-12px'>
        <div className='flex items-center justify-between gap-8px'>
          <Typography.Text type='secondary' className='text-12px'>
            {description}
          </Typography.Text>
          {formattedMtime ? (
            <Typography.Text type='secondary' className='text-12px'>
              {mtimeLabel}: {formattedMtime}
            </Typography.Text>
          ) : null}
        </div>
        <TextArea value={draft} onChange={onChange} autoSize={{ minRows: 18, maxRows: 28 }} placeholder={placeholder} />
      </label>
    </SectionCard>
  );
};

const MemoryPanel: React.FC = () => {
  const { t } = useTranslation();
  const { error, loading, memory, reload, unsupported, user } = useHermesMemory();

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

  const anySaving = memory.saving || user.saving;

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('settings.hermes.memory.title')}
        description={t('settings.hermes.memory.description')}
        action={
          <Button icon={<Refresh />} onClick={() => void reload()} disabled={anySaving}>
            {t('common.reload')}
          </Button>
        }
      />

      {error ? <Alert type='error' content={error} /> : null}

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-16px'>
        <SectionEditor
          title={t('settings.hermes.memory.userLabel')}
          description={t('settings.hermes.memory.userPlaceholder')}
          placeholder={t('settings.hermes.memory.userPlaceholder')}
          draft={user.draft}
          isDirty={user.isDirty}
          saving={user.saving}
          mtime={user.mtime}
          onChange={user.setDraft}
          onSave={() => void user.save()}
          saveLabel={t('settings.hermes.memory.saveUser')}
          mtimeLabel={t('settings.hermes.memory.lastModified')}
        />
        <SectionEditor
          title={t('settings.hermes.memory.memoryLabel')}
          description={t('settings.hermes.memory.memoryPlaceholder')}
          placeholder={t('settings.hermes.memory.memoryPlaceholder')}
          draft={memory.draft}
          isDirty={memory.isDirty}
          saving={memory.saving}
          mtime={memory.mtime}
          onChange={memory.setDraft}
          onSave={() => void memory.save()}
          saveLabel={t('settings.hermes.memory.saveAgent')}
          mtimeLabel={t('settings.hermes.memory.lastModified')}
        />
      </div>
    </div>
  );
};

export default MemoryPanel;

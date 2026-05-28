/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { HermesSkillDetail, HermesSkillSummary } from '@/common/types/hermes/hermesExt';
import MarkdownView from '@renderer/components/Markdown';
import { Alert, Button, Empty, Input, Tag, Typography } from '@arco-design/web-react';
import { Refresh, Search } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelHeader, PanelLoading, SectionCard, StatCard } from './components';

const UNCATEGORIZED_KEY = '__uncategorized__';

const SkillsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<HermesSkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HermesSkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipcBridge.acpConversation.hermesExt.listSkills.invoke();
      setSkills(result.skills);
      setUnsupported(false);
      if (result.skills.length > 0 && !selectedId) {
        setSelectedId(result.skills[0].id);
      }
    } catch (loadError) {
      if (isBackendHttpError(loadError) && loadError.status === 404) {
        setUnsupported(true);
        setSkills([]);
        return;
      }
      setError(t('settings.hermes.skills.loadError'));
    } finally {
      setLoading(false);
    }
  }, [selectedId, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    ipcBridge.acpConversation.hermesExt.getSkill
      .invoke({ id: selectedId })
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.category.toLowerCase().includes(q) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [query, skills]);

  const grouped = useMemo(() => {
    const groups = new Map<string, HermesSkillSummary[]>();
    for (const skill of filtered) {
      const key = skill.category || UNCATEGORIZED_KEY;
      const existing = groups.get(key);
      if (existing) existing.push(skill);
      else groups.set(key, [skill]);
    }
    return [...groups.entries()].toSorted(([a], [b]) => {
      if (a === UNCATEGORIZED_KEY) return 1;
      if (b === UNCATEGORIZED_KEY) return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  if (loading) {
    return <PanelLoading />;
  }

  if (unsupported) {
    return (
      <Alert
        type='warning'
        title={t('settings.hermes.skills.unsupportedTitle')}
        content={t('settings.hermes.skills.unsupportedDescription')}
      />
    );
  }

  const categoryCount = new Set(skills.map((s) => s.category).filter((c) => c.length > 0)).size;

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('settings.hermes.skills.title')}
        description={t('settings.hermes.skills.description')}
        action={
          <Button icon={<Refresh />} onClick={() => void load()}>
            {t('common.reload')}
          </Button>
        }
      />

      {error ? <Alert type='error' content={error} /> : null}

      <div className='grid grid-cols-1 md:grid-cols-3 gap-12px'>
        <StatCard label={t('settings.hermes.skills.summary.total')} value={skills.length} />
        <StatCard label={t('settings.hermes.skills.summary.categories')} value={categoryCount} />
        <StatCard label={t('settings.hermes.skills.summary.filtered')} value={filtered.length} />
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-16px'>
        <SectionCard
          title={t('settings.hermes.skills.installed')}
          extra={
            <Input
              size='small'
              prefix={<Search theme='outline' />}
              placeholder={t('settings.hermes.skills.searchPlaceholder')}
              value={query}
              onChange={setQuery}
              allowClear
              style={{ width: 180 }}
            />
          }
        >
          {grouped.length === 0 ? (
            <Empty description={t('settings.hermes.skills.empty')} />
          ) : (
            <div className='flex flex-col gap-12px max-h-540px overflow-y-auto'>
              {grouped.map(([categoryKey, items]) => (
                <div key={categoryKey}>
                  <Typography.Text type='secondary' className='text-12px uppercase tracking-wider'>
                    {categoryKey === UNCATEGORIZED_KEY ? t('settings.hermes.skills.uncategorized') : categoryKey}
                  </Typography.Text>
                  <div className='flex flex-col gap-4px mt-4px'>
                    {items.map((skill) => {
                      const active = selectedId === skill.id;
                      return (
                        <button
                          type='button'
                          key={skill.id}
                          onClick={() => setSelectedId(skill.id)}
                          className={`text-left rounded-8px px-10px py-8px border ${
                            active ? 'border-primary-6 bg-primary-1' : 'border-transparent hover:bg-2'
                          }`}
                        >
                          <Typography.Text className='font-500 block' ellipsis>
                            {skill.name}
                          </Typography.Text>
                          {skill.description ? (
                            <Typography.Text type='secondary' className='text-12px block' ellipsis>
                              {skill.description}
                            </Typography.Text>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={detail?.name || t('settings.hermes.skills.detailTitle')}>
          {detailLoading ? (
            <PanelLoading />
          ) : !detail ? (
            <Empty description={t('settings.hermes.skills.selectPrompt')} />
          ) : (
            <div className='flex flex-col gap-12px min-w-0'>
              <div className='flex flex-wrap items-center gap-6px'>
                {detail.category ? <Tag color='arcoblue'>{detail.category}</Tag> : null}
                {detail.version ? <Tag>v{detail.version}</Tag> : null}
                {detail.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
              <MarkdownView className='max-h-540px overflow-y-auto'>{detail.content}</MarkdownView>
              {detail.files.length > 0 ? (
                <div>
                  <Typography.Text type='secondary' className='text-12px block mb-4px'>
                    {t('settings.hermes.skills.siblingFiles')}
                  </Typography.Text>
                  <div className='flex flex-wrap gap-4px'>
                    {detail.files.map((file) => (
                      <Tag key={file} size='small'>
                        {file}
                      </Tag>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default SkillsPanel;

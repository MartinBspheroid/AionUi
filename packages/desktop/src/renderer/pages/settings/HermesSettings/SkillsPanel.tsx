/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HermesSkillDetail, HermesSkillSummary } from '@/common/types/hermes/hermesExt';
import { acpConversation } from '@/common/adapter/ipcBridge';
import { Alert, Input, Tag, Typography } from '@arco-design/web-react';
import { Folder, Search } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownView from '@renderer/components/Markdown';
import { PanelHeader, PanelLoading, SectionCard, StatCard } from './components';

const { Text } = Typography;

const UNCATEGORIZED_KEY = '__uncategorized__';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByCategory(skills: HermesSkillSummary[]): Map<string, HermesSkillSummary[]> {
  const map = new Map<string, HermesSkillSummary[]>();
  for (const skill of skills) {
    const key = skill.category || UNCATEGORIZED_KEY;
    const existing = map.get(key);
    if (existing) {
      existing.push(skill);
    } else {
      map.set(key, [skill]);
    }
  }
  return map;
}

function sortedCategories(map: Map<string, HermesSkillSummary[]>): string[] {
  const keys = [...map.keys()];
  return keys.sort((a, b) => {
    if (a === UNCATEGORIZED_KEY) return 1;
    if (b === UNCATEGORIZED_KEY) return -1;
    return a.localeCompare(b);
  });
}

function matchesSearch(skill: HermesSkillSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q) ||
    skill.category.toLowerCase().includes(q) ||
    skill.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type SkillListItemProps = {
  skill: HermesSkillSummary;
  selected: boolean;
  onSelect: (id: string) => void;
};

const SkillListItem: React.FC<SkillListItemProps> = ({ skill, selected, onSelect }) => (
  <button
    type='button'
    className={`w-full text-left px-12px py-8px rd-6px cursor-pointer border transition-colors outline-none ${
      selected
        ? 'bg-primary-1 border-primary-4 text-t-primary'
        : 'bg-transparent border-transparent hover:bg-fill-1 text-t-primary'
    }`}
    onClick={() => onSelect(skill.id)}
  >
    <div className='text-13px font-500 truncate'>{skill.name}</div>
    {skill.description && <div className='text-11px text-t-secondary truncate mt-1px'>{skill.description}</div>}
  </button>
);

type SkillDetailPaneProps = {
  detail: HermesSkillDetail | null;
  loading: boolean;
  selectPrompt: string;
};

const SkillDetailPane: React.FC<SkillDetailPaneProps> = ({ detail, loading, selectPrompt }) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full' style={{ minHeight: 200 }}>
        <PanelLoading />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className='flex items-center justify-center h-full text-t-tertiary text-13px' style={{ minHeight: 200 }}>
        {selectPrompt}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-16px min-w-0'>
      {/* Meta section */}
      <SectionCard title={t('settings.hermes.skills.detailTitle')}>
        <div className='flex flex-col gap-8px'>
          {/* Category / version row */}
          <div className='flex flex-wrap items-center gap-8px'>
            {detail.category && (
              <div className='flex items-center gap-4px text-12px text-t-secondary'>
                <Folder theme='outline' size={13} />
                <span>{detail.category}</span>
              </div>
            )}
            {detail.version && (
              <Tag size='small' color='arcoblue'>
                v{detail.version}
              </Tag>
            )}
          </div>
          {/* Tags */}
          {detail.tags.length > 0 && (
            <div className='flex flex-wrap gap-6px'>
              {detail.tags.map((tag) => (
                <Tag key={tag} size='small'>
                  {tag}
                </Tag>
              ))}
            </div>
          )}
          {/* Bundled files */}
          {detail.files.length > 0 && (
            <div className='flex flex-col gap-4px'>
              <Text className='text-11px text-t-tertiary uppercase tracking-wide'>
                {t('settings.hermes.skills.siblingFiles')}
              </Text>
              <div className='flex flex-wrap gap-6px'>
                {detail.files.map((file) => (
                  <Tag key={file} size='small' color='gray'>
                    {file}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Content rendered as markdown */}
      <SectionCard>
        <MarkdownView className='text-13px'>{detail.content}</MarkdownView>
      </SectionCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

const SkillsPanel: React.FC = () => {
  const { t } = useTranslation();

  const [skills, setSkills] = useState<HermesSkillSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HermesSkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Load skill list on mount
  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await acpConversation.hermesExt.listSkills.invoke();
      if (!resp) {
        setUnsupported(true);
        return;
      }
      setSkills(resp.skills);
      setCategories(resp.categories);
    } catch (err) {
      // 404 → unsupported
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        setUnsupported(true);
      } else {
        setError(t('settings.hermes.skills.loadError'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  // Load detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    acpConversation.hermesExt.getSkill
      .invoke({ id: selectedId })
      .then((d) => {
        if (!cancelled) setDetail(d ?? null);
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

  // Filtered skills
  const filteredSkills = useMemo(() => skills.filter((s) => matchesSearch(s, searchQuery)), [skills, searchQuery]);

  // Grouped + sorted
  const grouped = useMemo(() => groupByCategory(filteredSkills), [filteredSkills]);
  const sortedCats = useMemo(() => sortedCategories(grouped), [grouped]);

  // Stats
  const totalSkills = skills.length;
  const categoryCount = categories.length;
  const filteredCount = filteredSkills.length;

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

  return (
    <div className='flex flex-col gap-16px h-full'>
      <PanelHeader title={t('settings.hermes.skills.title')} description={t('settings.hermes.skills.description')} />

      {error && <Alert type='error' content={error} />}

      {/* Stat cards */}
      <div className='grid grid-cols-3 gap-12px'>
        <StatCard label={t('settings.hermes.skills.summary.total')} value={totalSkills} />
        <StatCard label={t('settings.hermes.skills.summary.categories')} value={categoryCount} />
        <StatCard label={t('settings.hermes.skills.summary.filtered')} value={filteredCount} />
      </div>

      {/* Main two-column layout */}
      <div className='flex gap-16px flex-1 min-h-0' style={{ minHeight: 400 }}>
        {/* Left sidebar */}
        <div className='w-[240px] shrink-0 flex flex-col gap-8px'>
          {/* Search input */}
          <Input
            prefix={<Search size={14} />}
            placeholder={t('settings.hermes.skills.searchPlaceholder')}
            value={searchQuery}
            onChange={(v) => {
              setSearchQuery(v);
              setSelectedId(null);
            }}
            allowClear
          />

          {/* Grouped list */}
          <div className='flex-1 overflow-y-auto flex flex-col gap-8px'>
            {sortedCats.length === 0 && (
              <div className='text-t-tertiary text-13px text-center py-16px'>{t('settings.hermes.skills.empty')}</div>
            )}
            {sortedCats.map((cat) => {
              const catSkills = grouped.get(cat) ?? [];
              const displayName = cat === UNCATEGORIZED_KEY ? t('settings.hermes.skills.uncategorized') : cat;
              return (
                <div key={cat} className='flex flex-col gap-2px'>
                  <Text className='text-11px text-t-tertiary uppercase tracking-wide px-12px py-4px'>
                    {displayName}
                  </Text>
                  {catSkills.map((skill) => (
                    <SkillListItem
                      key={skill.id}
                      skill={skill}
                      selected={skill.id === selectedId}
                      onSelect={setSelectedId}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right detail pane */}
        <div className='flex-1 min-w-0 overflow-y-auto'>
          <SkillDetailPane
            detail={detail}
            loading={detailLoading}
            selectPrompt={t('settings.hermes.skills.selectPrompt')}
          />
        </div>
      </div>
    </div>
  );
};

export default SkillsPanel;

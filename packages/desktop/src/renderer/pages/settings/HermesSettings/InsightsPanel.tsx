/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { HermesUsageSnapshot } from '@/common/types/hermes/hermesExt';
import { Button, Empty, Table, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelHeader, PanelLoading, SectionCard, StatCard } from './components';

/**
 * Extracts token usage from conversation objects and groups by date + model.
 * Defensively handles missing token data since the backend schema may vary.
 */
export function computeUsageSnapshot(conversations: TChatConversation[]): HermesUsageSnapshot[] {
  type Row = { date: string; model: string; inputTokens: number; outputTokens: number; estimatedCostUsd: number };
  const byDate = new Map<string, Map<string, Row>>();

  for (const conv of conversations) {
    const extra = conv.extra as Record<string, unknown> | undefined;
    const usage = (extra?.token_usage ?? (conv as Record<string, unknown>).token_usage) as
      | Record<string, unknown>
      | undefined;
    if (!usage) continue;

    const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
    const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
    const estimatedCostUsd = Number(usage.estimated_cost_usd ?? usage.estimatedCostUsd ?? 0);
    if (inputTokens === 0 && outputTokens === 0) continue;

    const model = String(extra?.model ?? (conv as Record<string, unknown>).model ?? 'unknown');
    const dateRaw = String(
      (conv as Record<string, unknown>).created_at ?? (conv as Record<string, unknown>).updated_at ?? ''
    );
    const date = dateRaw ? new Date(Number(dateRaw) || dateRaw).toISOString().slice(0, 10) : 'unknown';

    if (!byDate.has(date)) byDate.set(date, new Map());
    const dateMap = byDate.get(date)!;
    const existing = dateMap.get(model);
    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.estimatedCostUsd += estimatedCostUsd;
    } else {
      dateMap.set(model, { date, model, inputTokens, outputTokens, estimatedCostUsd });
    }
  }

  return [...byDate.entries()]
    .toSorted(([a], [b]) => b.localeCompare(a))
    .map(([date, models]) => ({
      date,
      totalInputTokens: [...models.values()].reduce((s, m) => s + m.inputTokens, 0),
      totalOutputTokens: [...models.values()].reduce((s, m) => s + m.outputTokens, 0),
      estimatedCostUsd: [...models.values()].reduce((s, m) => s + m.estimatedCostUsd, 0),
      byModel: [...models.values()],
    }));
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  return `$${usd.toFixed(usd < 0.01 ? 4 : 2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const InsightsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [snapshots, setSnapshots] = useState<HermesUsageSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ipcBridge.database.getUserConversations.invoke({ limit: 500 });
      setSnapshots(computeUsageSnapshot(result.items));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { totalInput, totalOutput, totalCost, flatRows } = useMemo(() => {
    let tin = 0;
    let tout = 0;
    let tcost = 0;
    const rows: Array<{ key: string; date: string; model: string; input: number; output: number; cost: number }> = [];
    for (const snap of snapshots) {
      tin += snap.totalInputTokens;
      tout += snap.totalOutputTokens;
      tcost += snap.estimatedCostUsd;
      for (const m of snap.byModel) {
        rows.push({
          key: `${snap.date}-${m.model}`,
          date: snap.date,
          model: m.model,
          input: m.inputTokens,
          output: m.outputTokens,
          cost: m.estimatedCostUsd,
        });
      }
    }
    return { totalInput: tin, totalOutput: tout, totalCost: tcost, flatRows: rows };
  }, [snapshots]);

  const columns = useMemo(
    () => [
      { title: t('settings.hermes.insights.day'), dataIndex: 'date' },
      {
        title: t('settings.hermes.insights.model'),
        dataIndex: 'model',
        render: (v: string) => <Typography.Text className='text-12px font-mono'>{v}</Typography.Text>,
      },
      { title: t('settings.hermes.insights.inputTokens'), dataIndex: 'input', render: (v: number) => formatTokens(v) },
      {
        title: t('settings.hermes.insights.outputTokens'),
        dataIndex: 'output',
        render: (v: number) => formatTokens(v),
      },
      { title: t('settings.hermes.insights.totalCost'), dataIndex: 'cost', render: (v: number) => formatCost(v) },
    ],
    [t]
  );

  if (loading) return <PanelLoading />;

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('settings.hermes.insights.title')}
        description={t('settings.hermes.insights.description')}
        action={
          <Button icon={<Refresh />} onClick={() => void load()}>
            {t('settings.hermes.insights.refresh')}
          </Button>
        }
      />
      <div className='grid grid-cols-1 md:grid-cols-3 gap-12px'>
        <StatCard label={t('settings.hermes.insights.inputTokens')} value={formatTokens(totalInput)} />
        <StatCard label={t('settings.hermes.insights.outputTokens')} value={formatTokens(totalOutput)} />
        <StatCard label={t('settings.hermes.insights.totalCost')} value={formatCost(totalCost)} />
      </div>
      <SectionCard title={t('settings.hermes.insights.byModel')}>
        {flatRows.length === 0 ? (
          <Empty description={t('settings.hermes.insights.noData')} />
        ) : (
          <Table rowKey='key' columns={columns} data={flatRows} pagination={false} scroll={{ x: true }} />
        )}
      </SectionCard>
    </div>
  );
};

export default InsightsPanel;

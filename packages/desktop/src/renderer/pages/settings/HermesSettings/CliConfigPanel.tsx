/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  HermesCliConfigResponse,
  HermesCliCommandSummary,
  HermesCliRunResult,
  HermesCliRunResponse,
} from '@/common/types/hermes/hermesExt';
import { Button, Card, Grid, Spin, Tag, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatCommand(result: HermesCliRunResult): string {
  return [result.command, ...result.args].join(' ');
}

function formatOutput(result: HermesCliRunResult): string {
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trimEnd());
  if (result.stderr.trim()) parts.push(result.stderr.trimEnd());
  return parts.join('\n') || '(no output)';
}

function renderExitTag(result: HermesCliRunResult, t: (key: string, opts?: object) => string): React.ReactElement {
  if (result.timedOut) {
    return (
      <Tag color='orange' size='small'>
        {t('settings.hermes.cli.timedOut')}
      </Tag>
    );
  }
  const code = result.exitCode ?? 0;
  return (
    <Tag color={code === 0 ? 'green' : 'red'} size='small'>
      {t('settings.hermes.cli.exitCode', { code })}
    </Tag>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: React.ReactNode;
};

const StatCard: React.FC<StatCardProps> = ({ label, value }) => (
  <Card bordered style={{ flex: 1, minWidth: 120 }}>
    <Typography.Text type='secondary' style={{ fontSize: 12 }}>
      {label}
    </Typography.Text>
    <div style={{ marginTop: 4 }}>{value}</div>
  </Card>
);

type InfoTileProps = {
  label: string;
  value: string;
};

const InfoTile: React.FC<InfoTileProps> = ({ label, value }) => (
  <div style={{ marginBottom: 8 }}>
    <Typography.Text type='secondary' style={{ fontSize: 12 }}>
      {label}
    </Typography.Text>
    <div>
      <Typography.Text code style={{ wordBreak: 'break-all' }}>
        {value || '—'}
      </Typography.Text>
    </div>
  </div>
);

type OutputCardProps = {
  title: string;
  result: HermesCliRunResult | undefined;
  t: (key: string, opts?: object) => string;
};

const OutputCard: React.FC<OutputCardProps> = ({ title, result, t }) => {
  if (!result) return null;
  return (
    <Card
      bordered
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Text style={{ fontWeight: 600 }}>{title}</Typography.Text>
          {renderExitTag(result, t)}
          <Typography.Text type='secondary' style={{ fontSize: 12 }}>
            {formatCommand(result)}
          </Typography.Text>
        </span>
      }
      style={{ flex: 1, minWidth: 0 }}
    >
      <pre
        style={{
          margin: 0,
          padding: '8px 12px',
          background: 'var(--color-fill-2)',
          borderRadius: 4,
          fontSize: 12,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 260,
          overflowY: 'auto',
        }}
      >
        {formatOutput(result)}
      </pre>
    </Card>
  );
};

// ─── main component ───────────────────────────────────────────────────────────

const CliConfigPanel: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [data, setData] = useState<HermesCliConfigResponse | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastRunResult, setLastRunResult] = useState<HermesCliRunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ipcBridge.acpConversation.hermesExt.getCliConfig
      .invoke()
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setUnsupported(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { status?: number })?.status;
        setUnsupported(status === 404);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRun = useCallback(
    (commandId: string) => {
      if (runningId) return;
      setRunningId(commandId);
      setRunError(null);
      ipcBridge.acpConversation.hermesExt.runCliCommand
        .invoke({ command_id: commandId })
        .then((res) => {
          setLastRunResult(res);
        })
        .catch(() => {
          setRunError(t('settings.hermes.cli.runError'));
        })
        .finally(() => {
          setRunningId(null);
        });
    },
    [runningId, t]
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  if (unsupported) {
    return (
      <div style={{ padding: 24 }}>
        <Typography.Title heading={5}>{t('settings.hermes.cli.unsupportedTitle')}</Typography.Title>
        <Typography.Text type='secondary'>{t('settings.hermes.cli.unsupportedDescription')}</Typography.Text>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 24 }}>
        <Typography.Text type='secondary'>{t('settings.hermes.cli.loadError')}</Typography.Text>
      </div>
    );
  }

  const { cliPath, hermesHome, configPath, envPath, commands, overview } = data;

  // Group commands by category
  const grouped = commands.reduce<Record<string, HermesCliCommandSummary[]>>((acc, cmd) => {
    const cat = cmd.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cmd);
    return acc;
  }, {});

  const statusExitCode = overview.status?.exitCode ?? null;
  const configExitCode = overview.config?.exitCode ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page header */}
      <div>
        <Typography.Title heading={5} style={{ marginBottom: 4 }}>
          {t('settings.hermes.cli.title')}
        </Typography.Title>
        <Typography.Text type='secondary'>{t('settings.hermes.cli.description')}</Typography.Text>
      </div>

      {/* Stat cards */}
      <Grid.Row gutter={12}>
        <Grid.Col flex={1}>
          <StatCard
            label={t('settings.hermes.cli.statusOutput')}
            value={
              statusExitCode === null ? (
                <Typography.Text type='secondary'>—</Typography.Text>
              ) : (
                <Tag color={statusExitCode === 0 ? 'green' : 'red'} size='small'>
                  {t('settings.hermes.cli.exitCode', { code: statusExitCode })}
                </Tag>
              )
            }
          />
        </Grid.Col>
        <Grid.Col flex={1}>
          <StatCard
            label={t('settings.hermes.cli.configOutput')}
            value={
              configExitCode === null ? (
                <Typography.Text type='secondary'>—</Typography.Text>
              ) : (
                <Tag color={configExitCode === 0 ? 'green' : 'red'} size='small'>
                  {t('settings.hermes.cli.exitCode', { code: configExitCode })}
                </Tag>
              )
            }
          />
        </Grid.Col>
        <Grid.Col flex={1}>
          <StatCard
            label={t('settings.hermes.cli.commandsTitle')}
            value={<Typography.Text>{commands.length}</Typography.Text>}
          />
        </Grid.Col>
      </Grid.Row>

      {/* Info tiles */}
      <Card bordered title={t('settings.hermes.cli.summary.cli')}>
        <Grid.Row gutter={16}>
          <Grid.Col span={12}>
            <InfoTile label={t('settings.hermes.cli.summary.cli')} value={cliPath} />
            <InfoTile label={t('settings.hermes.cli.summary.home')} value={hermesHome} />
          </Grid.Col>
          <Grid.Col span={12}>
            <InfoTile label={t('settings.hermes.cli.summary.config')} value={configPath} />
            <InfoTile label={t('settings.hermes.cli.summary.env')} value={envPath} />
          </Grid.Col>
        </Grid.Row>
      </Card>

      {/* Side-by-side output cards */}
      {(overview.status ?? overview.config) && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          <OutputCard
            title={t('settings.hermes.cli.statusOutput')}
            result={overview.status}
            t={t as (key: string, opts?: object) => string}
          />
          <OutputCard
            title={t('settings.hermes.cli.configOutput')}
            result={overview.config}
            t={t as (key: string, opts?: object) => string}
          />
        </div>
      )}

      {/* Commands grouped by category */}
      {commands.length === 0 ? (
        <Typography.Text type='secondary'>{t('settings.hermes.cli.empty')}</Typography.Text>
      ) : (
        Object.entries(grouped).map(([category, cmds]) => (
          <Card
            key={category}
            bordered
            title={
              <Typography.Text style={{ textTransform: 'capitalize', fontWeight: 600 }}>{category}</Typography.Text>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cmds.map((cmd) => (
                <div
                  key={cmd.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text style={{ fontWeight: 500 }}>{cmd.label}</Typography.Text>
                    {cmd.description && (
                      <div>
                        <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                          {cmd.description}
                        </Typography.Text>
                      </div>
                    )}
                    <div>
                      <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                        <code>{[cmd.id, ...cmd.args].join(' ')}</code>
                      </Typography.Text>
                    </div>
                  </div>
                  <Button
                    size='small'
                    type='outline'
                    loading={runningId === cmd.id}
                    disabled={runningId !== null && runningId !== cmd.id}
                    onClick={() => {
                      handleRun(cmd.id);
                    }}
                  >
                    {t('settings.hermes.cli.run')}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      {/* Last run result */}
      {runError && (
        <Typography.Text type='error' style={{ fontSize: 13 }}>
          {runError}
        </Typography.Text>
      )}
      {lastRunResult && (
        <OutputCard
          title={lastRunResult.command.label}
          result={lastRunResult.result}
          t={t as (key: string, opts?: object) => string}
        />
      )}
    </div>
  );
};

export default CliConfigPanel;

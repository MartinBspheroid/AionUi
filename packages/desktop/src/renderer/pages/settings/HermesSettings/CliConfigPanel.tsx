/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type {
  HermesCliCommandSummary,
  HermesCliConfigResponse,
  HermesCliRunResponse,
  HermesCliRunResult,
} from '@/common/types/hermes/hermesExt';
import { Alert, Button, Empty, Tag, Typography } from '@arco-design/web-react';
import { Refresh, Terminal } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTile, OutputCard, PanelHeader, PanelLoading, SectionCard, StatCard } from './components';

type HermesCliConfigState = HermesCliConfigResponse;
type CommandRunState = HermesCliRunResponse;

function formatCommand(result?: HermesCliRunResult): string {
  if (!result) return '';
  return [result.command, ...result.args].join(' ');
}

function formatOutput(result?: HermesCliRunResult): string {
  if (!result) return '';
  const parts = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean);
  const text = parts.join('\n\n--- stderr ---\n');
  return text || '(no output)';
}

function renderExitTag(
  result?: HermesCliRunResult,
  timedOutLabel?: string,
  exitCodeLabel?: (code: string | number) => string
) {
  if (!result) return null;
  if (result.timedOut) return <Tag color='orange'>{timedOutLabel}</Tag>;
  const code = result.exitCode ?? 'unknown';
  return <Tag color={result.exitCode === 0 ? 'green' : 'red'}>{exitCodeLabel ? exitCodeLabel(code) : code}</Tag>;
}

const CliConfigPanel: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<HermesCliConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<CommandRunState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipcBridge.acpConversation.hermesExt.getCliConfig.invoke();
      setState(result);
      setUnsupported(false);
      setLastRun(null);
    } catch (loadError) {
      if (isBackendHttpError(loadError) && loadError.status === 404) {
        setUnsupported(true);
        setState(null);
        return;
      }
      setError(t('settings.hermes.cli.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedCommands = useMemo(() => {
    const groups = new Map<string, HermesCliCommandSummary[]>();
    for (const command of state?.commands ?? []) {
      const list = groups.get(command.category) ?? [];
      list.push(command);
      groups.set(command.category, list);
    }
    return Array.from(groups.entries());
  }, [state?.commands]);

  const runCommand = useCallback(
    async (command: HermesCliCommandSummary) => {
      setRunningId(command.id);
      setError(null);
      try {
        const result = await ipcBridge.acpConversation.hermesExt.runCliCommand.invoke({ command_id: command.id });
        setLastRun(result);
      } catch {
        setError(t('settings.hermes.cli.runError'));
      } finally {
        setRunningId(null);
      }
    },
    [t]
  );

  if (loading) {
    return <PanelLoading />;
  }

  if (unsupported) {
    return (
      <Alert
        type='warning'
        title={t('settings.hermes.cli.unsupportedTitle')}
        content={t('settings.hermes.cli.unsupportedDescription')}
      />
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('settings.hermes.cli.title')}
        description={t('settings.hermes.cli.description')}
        action={
          <Button icon={<Refresh />} onClick={() => void load()} disabled={!!runningId}>
            {t('common.reload')}
          </Button>
        }
      />

      {error ? <Alert type='error' content={error} /> : null}

      {state ? (
        <>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-12px'>
            <StatCard
              label={t('settings.hermes.cli.statusOutput')}
              value={state.overview.status?.exitCode === 0 ? t('settings.hermes.cli.exitCode', { code: 0 }) : '-'}
              hint={formatCommand(state.overview.status)}
              valueClassName={state.overview.status?.exitCode === 0 ? 'text-success-6' : ''}
            />
            <StatCard
              label={t('settings.hermes.cli.configOutput')}
              value={state.overview.config?.exitCode === 0 ? t('settings.hermes.cli.exitCode', { code: 0 }) : '-'}
              hint={formatCommand(state.overview.config)}
              valueClassName={state.overview.config?.exitCode === 0 ? 'text-success-6' : ''}
            />
            <StatCard label={t('settings.hermes.cli.commandsTitle')} value={state.commands.length} />
          </div>

          <SectionCard title={t('settings.hermes.title')} description={formatCommand(state.overview.version)}>
            <div className='grid grid-cols-1 lg:grid-cols-4 gap-12px'>
              <InfoTile label={t('settings.hermes.cli.summary.cli')} value={state.cliPath} />
              <InfoTile label={t('settings.hermes.cli.summary.home')} value={state.hermesHome} />
              <InfoTile label={t('settings.hermes.cli.summary.config')} value={state.configPath} />
              <InfoTile label={t('settings.hermes.cli.summary.env')} value={state.envPath} />
            </div>
          </SectionCard>

          <div className='grid grid-cols-1 xl:grid-cols-2 gap-16px'>
            <OutputCard
              title={t('settings.hermes.cli.statusOutput')}
              command={formatCommand(state.overview.status)}
              status={renderExitTag(state.overview.status, t('settings.hermes.cli.timedOut'), (code) =>
                t('settings.hermes.cli.exitCode', { code })
              )}
              value={formatOutput(state.overview.status)}
              minRows={8}
              maxRows={16}
            />
            <OutputCard
              title={t('settings.hermes.cli.configOutput')}
              command={formatCommand(state.overview.config)}
              status={renderExitTag(state.overview.config, t('settings.hermes.cli.timedOut'), (code) =>
                t('settings.hermes.cli.exitCode', { code })
              )}
              value={formatOutput(state.overview.config)}
              minRows={8}
              maxRows={16}
            />
          </div>

          <SectionCard
            title={t('settings.hermes.cli.commandsTitle')}
            description={t('settings.hermes.cli.commandsDescription')}
            extra={<Tag>{state.commands.length}</Tag>}
          >
            {groupedCommands.length === 0 ? (
              <Empty description={t('settings.hermes.cli.empty')} />
            ) : (
              <div className='flex flex-col gap-14px'>
                {groupedCommands.map(([category, commands]) => (
                  <div key={category} className='flex flex-col gap-8px'>
                    <Typography.Text type='secondary' className='font-500'>
                      {category}
                    </Typography.Text>
                    <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10px'>
                      {commands.map((command) => (
                        <div key={command.id} className='rounded-10px bg-2 p-12px flex flex-col gap-10px min-w-0'>
                          <div className='min-w-0 flex-1'>
                            <Typography.Text className='font-500' ellipsis>
                              {command.label}
                            </Typography.Text>
                            <div className='mt-2px'>
                              <Typography.Text type='secondary' className='text-12px'>
                                {command.description}
                              </Typography.Text>
                            </div>
                            <Typography.Text type='secondary' className='block mt-6px text-12px font-mono' ellipsis>
                              hermes {command.args.join(' ')}
                            </Typography.Text>
                          </div>
                          <Button
                            icon={<Terminal />}
                            loading={runningId === command.id}
                            disabled={!!runningId && runningId !== command.id}
                            onClick={() => void runCommand(command)}
                          >
                            {command.label}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {lastRun ? (
            <OutputCard
              title={lastRun.command.label}
              command={formatCommand(lastRun.result)}
              status={renderExitTag(lastRun.result, t('settings.hermes.cli.timedOut'), (code) =>
                t('settings.hermes.cli.exitCode', { code })
              )}
              value={formatOutput(lastRun.result)}
              minRows={12}
              maxRows={28}
            />
          ) : null}
        </>
      ) : (
        <SectionCard>
          <Empty description={t('settings.hermes.cli.empty')} />
        </SectionCard>
      )}
    </div>
  );
};

export default CliConfigPanel;

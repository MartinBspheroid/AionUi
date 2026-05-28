/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { Alert, Button, Empty, Input, Spin, Tag, Typography } from '@arco-design/web-react';
import { Refresh, Terminal } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;

type HermesCliCommandSummary = {
  id: string;
  label: string;
  description: string;
  args: string[];
  category: string;
};

type HermesCliRunResult = {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

type HermesCliConfigState = {
  hermesHome: string;
  cliPath: string;
  configPath: string;
  envPath: string;
  commands: HermesCliCommandSummary[];
  overview: {
    version?: HermesCliRunResult;
    status?: HermesCliRunResult;
    config?: HermesCliRunResult;
  };
};

type CommandRunState = {
  command: HermesCliCommandSummary;
  result: HermesCliRunResult;
};

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
        title={t('settings.hermes.cli.unsupportedTitle')}
        content={t('settings.hermes.cli.unsupportedDescription')}
      />
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex flex-col sm:flex-row sm:items-start sm:justify-between gap-12px'>
        <div className='min-w-0'>
          <Typography.Title heading={5} className='!mt-0 !mb-4px'>
            {t('settings.hermes.cli.title')}
          </Typography.Title>
          <Typography.Text type='secondary'>{t('settings.hermes.cli.description')}</Typography.Text>
        </div>
        <Button icon={<Refresh />} onClick={() => void load()} disabled={!!runningId}>
          {t('common.reload')}
        </Button>
      </div>

      {error ? <Alert type='error' content={error} /> : null}

      {state ? (
        <>
          <div className='grid grid-cols-1 lg:grid-cols-4 gap-12px'>
            <div className='rounded-8px bg-2 p-12px min-w-0'>
              <Typography.Text type='secondary'>{t('settings.hermes.cli.summary.cli')}</Typography.Text>
              <Typography.Text className='block font-500' ellipsis>
                {state.cliPath}
              </Typography.Text>
            </div>
            <div className='rounded-8px bg-2 p-12px min-w-0'>
              <Typography.Text type='secondary'>{t('settings.hermes.cli.summary.home')}</Typography.Text>
              <Typography.Text className='block font-500' ellipsis>
                {state.hermesHome}
              </Typography.Text>
            </div>
            <div className='rounded-8px bg-2 p-12px min-w-0'>
              <Typography.Text type='secondary'>{t('settings.hermes.cli.summary.config')}</Typography.Text>
              <Typography.Text className='block font-500' ellipsis>
                {state.configPath}
              </Typography.Text>
            </div>
            <div className='rounded-8px bg-2 p-12px min-w-0'>
              <Typography.Text type='secondary'>{t('settings.hermes.cli.summary.env')}</Typography.Text>
              <Typography.Text className='block font-500' ellipsis>
                {state.envPath}
              </Typography.Text>
            </div>
          </div>

          <div className='grid grid-cols-1 xl:grid-cols-2 gap-16px'>
            <section className='rounded-8px border border-b-base p-12px min-w-0'>
              <div className='flex items-center justify-between gap-8px mb-8px'>
                <Typography.Text className='font-500'>{t('settings.hermes.cli.statusOutput')}</Typography.Text>
                <Tag color={state.overview.status?.exitCode === 0 ? 'green' : 'orange'}>
                  {formatCommand(state.overview.status)}
                </Tag>
              </div>
              <TextArea value={formatOutput(state.overview.status)} readOnly autoSize={{ minRows: 10, maxRows: 18 }} />
            </section>
            <section className='rounded-8px border border-b-base p-12px min-w-0'>
              <div className='flex items-center justify-between gap-8px mb-8px'>
                <Typography.Text className='font-500'>{t('settings.hermes.cli.configOutput')}</Typography.Text>
                <Tag color={state.overview.config?.exitCode === 0 ? 'green' : 'orange'}>
                  {formatCommand(state.overview.config)}
                </Tag>
              </div>
              <TextArea value={formatOutput(state.overview.config)} readOnly autoSize={{ minRows: 10, maxRows: 18 }} />
            </section>
          </div>

          <section className='rounded-8px border border-b-base p-12px min-w-0'>
            <div className='flex items-start justify-between gap-8px mb-12px'>
              <div>
                <Typography.Text className='font-500'>{t('settings.hermes.cli.commandsTitle')}</Typography.Text>
                <div>
                  <Typography.Text type='secondary'>{t('settings.hermes.cli.commandsDescription')}</Typography.Text>
                </div>
              </div>
              <Tag>{state.commands.length}</Tag>
            </div>
            {groupedCommands.length === 0 ? (
              <Empty description={t('settings.hermes.cli.empty')} />
            ) : (
              <div className='flex flex-col gap-14px'>
                {groupedCommands.map(([category, commands]) => (
                  <div key={category} className='flex flex-col gap-8px'>
                    <Typography.Text type='secondary' className='font-500'>
                      {category}
                    </Typography.Text>
                    <div className='flex flex-wrap gap-8px'>
                      {commands.map((command) => (
                        <Button
                          key={command.id}
                          icon={<Terminal />}
                          loading={runningId === command.id}
                          disabled={!!runningId && runningId !== command.id}
                          title={`${command.description}\nhermes ${command.args.join(' ')}`}
                          onClick={() => void runCommand(command)}
                        >
                          {command.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {lastRun ? (
            <section className='rounded-8px border border-b-base p-12px min-w-0'>
              <div className='flex items-center justify-between gap-8px mb-8px'>
                <div className='min-w-0'>
                  <Typography.Text className='font-500'>{lastRun.command.label}</Typography.Text>
                  <div>
                    <Typography.Text type='secondary' className='text-12px' ellipsis>
                      {formatCommand(lastRun.result)}
                    </Typography.Text>
                  </div>
                </div>
                <Tag color={lastRun.result.exitCode === 0 ? 'green' : 'red'}>
                  {lastRun.result.timedOut
                    ? t('settings.hermes.cli.timedOut')
                    : t('settings.hermes.cli.exitCode', { code: lastRun.result.exitCode ?? 'unknown' })}
                </Tag>
              </div>
              <TextArea value={formatOutput(lastRun.result)} readOnly autoSize={{ minRows: 12, maxRows: 28 }} />
            </section>
          ) : null}
        </>
      ) : (
        <Empty description={t('settings.hermes.cli.empty')} />
      )}
    </div>
  );
};

export default CliConfigPanel;

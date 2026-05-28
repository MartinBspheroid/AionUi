/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AcpSlashCommandPayload } from '@/common/chat/slash/acpCommands';
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { MoreOne } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type HeaderActionKey = 'compact' | 'retry' | 'undo' | 'branch' | 'rollback';

type HeaderAction = {
  key: HeaderActionKey;
  command: string;
  label: string;
};

const COMMAND_GROUPS: Array<{ key: HeaderActionKey; candidates: string[]; defaultLabel: string }> = [
  { key: 'compact', candidates: ['compact', 'compress'], defaultLabel: 'Compact' },
  { key: 'retry', candidates: ['retry'], defaultLabel: 'Retry' },
  { key: 'undo', candidates: ['undo'], defaultLabel: 'Undo' },
  { key: 'branch', candidates: ['branch', 'fork'], defaultLabel: 'Branch' },
  { key: 'rollback', candidates: ['rollback'], defaultLabel: 'Rollback' },
];

function getCommandName(command: AcpSlashCommandPayload): string | undefined {
  return (command.name ?? command.command)?.replace(/^\/+/, '');
}

export function getHermesHeaderActions(
  commands: AcpSlashCommandPayload[],
  translate: (key: string, options: { defaultValue: string }) => string
): HeaderAction[] {
  const advertised = new Set(
    commands.flatMap((command) => {
      const name = getCommandName(command);
      return name ? [name] : [];
    })
  );

  return COMMAND_GROUPS.flatMap(({ key, candidates, defaultLabel }) => {
    const command = candidates.find((candidate) => advertised.has(candidate));
    if (!command) return [];
    return [
      {
        key,
        command,
        label: translate(`conversation.hermesHeaderActions.${key}`, { defaultValue: defaultLabel }),
      },
    ];
  });
}

const HermesHeaderActionsMenu: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const [commands, setCommands] = useState<AcpSlashCommandPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingCommand, setSendingCommand] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void ipcBridge.acpConversation.getSlashCommands
      .invoke({ conversation_id })
      .then((result) => {
        if (!cancelled) {
          setCommands(result);
        }
      })
      .catch((error) => {
        console.error('[HermesHeaderActionsMenu] Failed to load slash commands:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  const actions = useMemo(() => getHermesHeaderActions(commands, t), [commands, t]);

  const runCommand = useCallback(
    async (command: string) => {
      if (sendingCommand) return;
      setSendingCommand(command);
      try {
        await ipcBridge.acpConversation.sendMessage.invoke({
          conversation_id,
          input: `/${command}`,
        });
        Message.success(t('conversation.hermesHeaderActions.success', { defaultValue: 'Command sent' }));
      } catch (error) {
        console.error('[HermesHeaderActionsMenu] Failed to send slash command:', error);
        Message.error(t('conversation.hermesHeaderActions.error', { defaultValue: 'Failed to send command' }));
      } finally {
        setSendingCommand(null);
      }
    },
    [conversation_id, sendingCommand, t]
  );

  if (!loading && actions.length === 0) {
    return null;
  }

  return (
    <Dropdown
      droplist={
        <Menu
          onClickMenuItem={(key) => {
            const action = actions.find((item) => item.key === key);
            if (action) {
              void runCommand(action.command);
            }
          }}
        >
          {actions.map((action) => (
            <Menu.Item key={action.key}>{action.label}</Menu.Item>
          ))}
        </Menu>
      }
      trigger={['click']}
      disabled={loading || actions.length === 0}
    >
      <Tooltip content={t('conversation.hermesHeaderActions.tooltip', { defaultValue: 'Hermes actions' })}>
        <Button
          size='mini'
          loading={loading}
          icon={<MoreOne theme='outline' size='14' fill='currentColor' className='block leading-none' />}
        />
      </Tooltip>
    </Dropdown>
  );
};

export default HermesHeaderActionsMenu;

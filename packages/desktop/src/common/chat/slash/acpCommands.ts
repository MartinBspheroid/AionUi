/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommandItem } from './types';

export interface AcpSlashCommandPayload {
  name?: string;
  command?: string;
  description?: string;
  hint?: string;
  input_hint?: string;
  input?:
    | string
    | {
        hint?: string;
        root?: {
          hint?: string;
        };
      };
}

function getCommandHint(command: AcpSlashCommandPayload): string | undefined {
  if (command.hint) {
    return command.hint;
  }
  if (command.input_hint) {
    return command.input_hint;
  }
  if (typeof command.input === 'string') {
    return command.input;
  }
  return command.input?.root?.hint ?? command.input?.hint;
}

export function mapAcpCommandToSlashCommand(command: AcpSlashCommandPayload): SlashCommandItem | null {
  const name = command.name ?? command.command;
  if (!name) {
    return null;
  }

  const hint = getCommandHint(command);
  return {
    name,
    description: command.description ?? '',
    kind: 'template',
    source: 'acp',
    selectionBehavior: 'insert',
    ...(hint ? { hint } : {}),
  };
}

export function mapAcpCommandsToSlashCommands(commands: AcpSlashCommandPayload[]): SlashCommandItem[] {
  return commands.flatMap((command) => {
    const mapped = mapAcpCommandToSlashCommand(command);
    return mapped ? [mapped] : [];
  });
}

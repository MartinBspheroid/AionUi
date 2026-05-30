/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI config endpoint — exposes Hermes runtime locations, a hardcoded allowlist
 * of safe read-only diagnostic commands, and a runner for those commands. The
 * allowlist is the security boundary: only command args defined here are ever
 * executed, never values taken from the request body.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  HermesCliCommandSummary,
  HermesCliConfigResponse,
  HermesCliRunResponse,
} from '@/common/types/hermes/hermesExt';
import type { HermesCtx } from './hermesHttp';
import { readJsonBody, runHermesCli, sendError, sendJson } from './hermesHttp';

/**
 * Hardcoded allowlist of safe, read-only diagnostic commands. This is the
 * security boundary — request bodies may only reference a command by `id`;
 * the args run are exclusively those defined below.
 */
const COMMANDS: HermesCliCommandSummary[] = [
  { id: 'status', label: 'Status', description: 'Show component status', args: ['status'], category: 'Diagnostics' },
  {
    id: 'config',
    label: 'Config',
    description: 'Show current config',
    args: ['config', 'show'],
    category: 'Diagnostics',
  },
  { id: 'version', label: 'Version', description: 'Show version', args: ['version'], category: 'Diagnostics' },
  { id: 'doctor', label: 'Doctor', description: 'Check config & deps', args: ['doctor'], category: 'Diagnostics' },
  {
    id: 'sessions-stats',
    label: 'Session stats',
    description: 'Session store statistics',
    args: ['sessions', 'stats'],
    category: 'Sessions',
  },
  {
    id: 'skills-list',
    label: 'List skills',
    description: 'List installed skills',
    args: ['skills', 'list'],
    category: 'Skills',
  },
  { id: 'insights', label: 'Insights', description: 'Token usage & costs', args: ['insights'], category: 'Usage' },
];

/**
 * Resolve a filesystem path via a `hermes config <subcommand>` invocation,
 * falling back to a default under HERMES_HOME when the CLI fails or is silent.
 */
async function resolvePath(hermesBin: string, args: string[], timeoutMs: number, fallback: string): Promise<string> {
  const result = await runHermesCli(hermesBin, args, timeoutMs);
  const trimmed = result.stdout.trim();
  if (result.exitCode === 0 && trimmed.length > 0) {
    return trimmed;
  }
  return fallback;
}

export async function handleCliConfig(
  ctx: HermesCtx,
  req: IncomingMessage,
  res: ServerResponse,
  method: string
): Promise<boolean> {
  if (method === 'GET') {
    const [configPath, envPath, version, status, config] = await Promise.all([
      resolvePath(ctx.hermesBin, ['config', 'path'], ctx.cliTimeoutMs, `${ctx.hermesHome}/config.yaml`),
      resolvePath(ctx.hermesBin, ['config', 'env-path'], ctx.cliTimeoutMs, `${ctx.hermesHome}/.env`),
      runHermesCli(ctx.hermesBin, ['version'], ctx.cliTimeoutMs),
      runHermesCli(ctx.hermesBin, ['status'], ctx.cliTimeoutMs),
      runHermesCli(ctx.hermesBin, ['config', 'show'], ctx.cliTimeoutMs),
    ]);

    const response: HermesCliConfigResponse = {
      hermesHome: ctx.hermesHome,
      cliPath: ctx.hermesBin,
      configPath,
      envPath,
      commands: COMMANDS,
      overview: { version, status, config },
    };
    return sendJson(res, 200, response);
  }

  if (method === 'POST') {
    const body = await readJsonBody<{ command_id?: string }>(req);
    const commandId = body.command_id;
    const command = COMMANDS.find((c) => c.id === commandId);
    if (!command) {
      return sendError(res, 400, 'unknown command');
    }
    const result = await runHermesCli(ctx.hermesBin, command.args, ctx.cliTimeoutMs);
    const response: HermesCliRunResponse = { command, result };
    return sendJson(res, 200, response);
  }

  return sendError(res, 405, 'method not allowed');
}

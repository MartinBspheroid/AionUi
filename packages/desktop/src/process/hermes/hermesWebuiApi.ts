/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hermes WebUI API bridge (dispatcher).
 *
 * AionUi's renderer expects `/api/agents/hermes/*` endpoints, but the aioncore
 * backend does not serve them. This module implements those endpoints in the
 * webui's Node layer by reading the real Hermes agent's HERMES_HOME directory
 * (memory / sessions / skills / cron / config) and shelling out to the `hermes`
 * CLI for mutations. It is injected into the webui via web-host's
 * `localApiHandlers` hook (see scripts/webui.ts) and tried before the aioncore
 * reverse-proxy — it only ever claims the `/api/agents/hermes/*` namespace, so
 * it never shadows a real backend route.
 *
 * Only Node built-ins are imported at runtime; all AionUi type imports are
 * `import type` (erased at build time) so this module loads under tsx without
 * any path-alias resolution.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LocalApiHandler } from '@aionui/web-host';
import { sendError, type HermesCtx } from './hermesHttp';
import { handleMemory } from './hermesMemory';
import { handleSessions } from './hermesSessions';
import { handleSkills } from './hermesSkills';
import { handleCron } from './hermesCron';
import { handleCliConfig } from './hermesCliConfig';

export type HermesApiOptions = {
  /** Absolute path to HERMES_HOME (e.g. /root/.hermes). */
  hermesHome: string;
  /** Path to the hermes CLI binary. Defaults to 'hermes' (resolved via PATH). */
  hermesBin?: string;
  /** Per-CLI-command timeout in ms. Default 20000. */
  cliTimeoutMs?: number;
};

const HERMES_PREFIX = '/api/agents/hermes';

/**
 * Builds a {@link LocalApiHandler} serving `/api/agents/hermes/*` from the real
 * Hermes agent. Returns false (falls through to the aioncore proxy) for any
 * path it does not own.
 */
export function createHermesApiHandler(opts: HermesApiOptions): LocalApiHandler {
  const ctx: HermesCtx = {
    hermesHome: opts.hermesHome,
    hermesBin: opts.hermesBin ?? 'hermes',
    cliTimeoutMs: opts.cliTimeoutMs ?? 20000,
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const rawUrl = req.url ?? '';
    if (!rawUrl.startsWith(`${HERMES_PREFIX}/`) && rawUrl !== HERMES_PREFIX) return false;

    const url = new URL(rawUrl, 'http://localhost');
    const pathname = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();
    const sub = pathname.slice(HERMES_PREFIX.length); // '', '/memory', '/cron/jobs', ...

    try {
      if (sub === '/memory') return await handleMemory(ctx.hermesHome, req, res, method);
      if (sub === '/sessions') return await handleSessions(ctx.hermesHome, res);
      if (sub === '/skills') return await handleSkills(ctx.hermesHome, url, res);
      if (sub === '/cli-config') return await handleCliConfig(ctx, req, res, method);
      if (sub === '/cron/jobs' || sub.startsWith('/cron/jobs/')) {
        return await handleCron(ctx, req, res, url, method);
      }
      return sendError(res, 404, 'hermes endpoint not implemented');
    } catch (err) {
      return sendError(res, 500, err instanceof Error ? err.message : 'internal error');
    }
  };
}

export { HERMES_PREFIX };

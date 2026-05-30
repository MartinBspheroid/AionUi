/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cron endpoint — list scheduled jobs from HERMES_HOME/cron/jobs.json and
 * mutate them via the `hermes cron` CLI (create/run/pause/resume/edit/remove).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  HermesCronCliResponse,
  HermesCronJobEdit,
  HermesCronJobInput,
  HermesCronJobsResponse,
  HermesCronJobSummary,
} from '@/common/types/hermes/hermesExt';
import { readJsonBody, runHermesCli, sendError, sendJson, type CliRunResult, type HermesCtx } from './hermesHttp';

const PREFIX = '/api/agents/hermes/cron/jobs';
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

type RawSchedule = {
  display?: string;
  expr?: string;
  kind?: string;
};

type RawRepeat = {
  completed?: number;
  times?: number | null;
};

type RawJob = {
  id?: string;
  name?: string;
  prompt?: string;
  skills?: string[];
  skill?: string;
  model?: string;
  provider?: string;
  base_url?: string;
  script?: string;
  context_from?: string;
  schedule?: RawSchedule;
  schedule_display?: string;
  repeat?: RawRepeat;
  enabled?: boolean;
  state?: string;
  paused_at?: string;
  paused_reason?: string;
  created_at?: string;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  last_error?: string;
  last_delivery_error?: string;
  deliver?: string;
  origin?: string;
  enabled_toolsets?: string[];
  workdir?: string;
  no_agent?: boolean;
};

type RawJobsFile = {
  jobs?: RawJob[];
  updated_at?: string;
};

function jobsPath(hermesHome: string): string {
  return path.join(hermesHome, 'cron', 'jobs.json');
}

function mapJob(raw: RawJob): HermesCronJobSummary {
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    enabled: raw.enabled !== false,
    state: raw.state,
    schedule_display: raw.schedule_display ?? raw.schedule?.display,
    schedule_kind: raw.schedule?.kind,
    schedule_expr: raw.schedule?.expr,
    repeat_completed: raw.repeat?.completed,
    repeat_times: raw.repeat?.times ?? null,
    next_run_at: raw.next_run_at,
    last_run_at: raw.last_run_at,
    last_status: raw.last_status,
    last_error: raw.last_error,
    last_delivery_error: raw.last_delivery_error,
    deliver: raw.deliver,
    script: raw.script,
    no_agent: raw.no_agent === true,
    workdir: raw.workdir,
    model: raw.model,
    provider: raw.provider,
    skills: raw.skills ?? [],
  };
}

function hasError(raw: RawJob): boolean {
  return raw.last_status === 'error' || Boolean(raw.last_error) || Boolean(raw.last_delivery_error);
}

function isPaused(raw: RawJob): boolean {
  return raw.enabled === false || raw.state === 'paused';
}

async function readJobs(hermesHome: string): Promise<RawJob[]> {
  let raw: string;
  try {
    raw = await fs.readFile(jobsPath(hermesHome), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as RawJobsFile;
  return Array.isArray(parsed.jobs) ? parsed.jobs : [];
}

function buildCreateArgv(input: HermesCronJobInput): string[] {
  const argv: string[] = ['cron', 'create', input.schedule];
  if (input.prompt) argv.push(input.prompt);
  if (input.name) argv.push('--name', input.name);
  if (input.deliver) argv.push('--deliver', input.deliver);
  if (typeof input.repeat === 'number') argv.push('--repeat', String(input.repeat));
  for (const skill of input.skills ?? []) argv.push('--skill', skill);
  if (input.script) argv.push('--script', input.script);
  if (input.no_agent) argv.push('--no-agent');
  if (input.workdir) argv.push('--workdir', input.workdir);
  if (input.profile) argv.push('--profile', input.profile);
  return argv;
}

function buildEditArgv(id: string, patch: HermesCronJobEdit): string[] {
  const argv: string[] = ['cron', 'edit', id];
  if (patch.schedule !== undefined) argv.push('--schedule', patch.schedule);
  if (patch.prompt !== undefined) argv.push('--prompt', patch.prompt);
  if (patch.name !== undefined) argv.push('--name', patch.name);
  if (patch.deliver !== undefined) argv.push('--deliver', patch.deliver);
  if (typeof patch.repeat === 'number') argv.push('--repeat', String(patch.repeat));
  if (patch.script !== undefined) argv.push('--script', patch.script);
  if (patch.workdir !== undefined) argv.push('--workdir', patch.workdir);
  if (patch.clear_skills) argv.push('--clear-skills');
  for (const skill of patch.add_skills ?? []) argv.push('--add-skill', skill);
  for (const skill of patch.remove_skills ?? []) argv.push('--remove-skill', skill);
  for (const skill of patch.skills ?? []) argv.push('--skill', skill);
  if (patch.no_agent === true) argv.push('--no-agent');
  else if (patch.no_agent === false) argv.push('--agent');
  return argv;
}

async function runCli(ctx: HermesCtx, res: ServerResponse, argv: string[]): Promise<boolean> {
  const result: CliRunResult = await runHermesCli(ctx.hermesBin, argv, ctx.cliTimeoutMs);
  return sendJson(res, 200, { result } satisfies HermesCronCliResponse);
}

export async function handleCron(
  ctx: HermesCtx,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  method: string
): Promise<boolean> {
  // Path after '/api/agents/hermes/cron/jobs': '' (collection) or '/:id' or '/:id/<action>'.
  const rest = url.pathname.slice(PREFIX.length).replace(/^\/+/, '');

  // Collection routes: /cron/jobs
  if (rest === '') {
    if (method === 'GET') {
      let jobs: RawJob[];
      try {
        jobs = await readJobs(ctx.hermesHome);
      } catch (err) {
        return sendError(res, 500, err instanceof Error ? err.message : 'failed to read jobs');
      }
      const total = jobs.length;
      const errors = jobs.filter(hasError).length;
      const paused = jobs.filter(isPaused).length;
      const active = jobs.filter((j) => j.enabled !== false && j.state !== 'paused' && !hasError(j)).length;
      const body: HermesCronJobsResponse = {
        jobs: jobs.map(mapJob),
        total,
        active,
        paused,
        errors,
      };
      return sendJson(res, 200, body);
    }
    if (method === 'POST') {
      let input: HermesCronJobInput;
      try {
        input = await readJsonBody<HermesCronJobInput>(req);
      } catch (err) {
        return sendError(res, 400, err instanceof Error ? err.message : 'bad request');
      }
      if (!input.schedule) return sendError(res, 400, 'schedule is required');
      return runCli(ctx, res, buildCreateArgv(input));
    }
    return sendError(res, 405, 'method not allowed');
  }

  // Item routes: /:id or /:id/<action>
  const segments = rest.split('/');
  const id = segments[0] ?? '';
  const action = segments[1];

  if (!ID_PATTERN.test(id)) return sendError(res, 400, 'invalid job id');

  if (action === 'run' && method === 'POST') return runCli(ctx, res, ['cron', 'run', id]);
  if (action === 'pause' && method === 'POST') return runCli(ctx, res, ['cron', 'pause', id]);
  if (action === 'resume' && method === 'POST') return runCli(ctx, res, ['cron', 'resume', id]);

  if (action === undefined) {
    if (method === 'PATCH') {
      let body: { id?: string; patch?: HermesCronJobEdit };
      try {
        body = await readJsonBody<{ id?: string; patch?: HermesCronJobEdit }>(req);
      } catch (err) {
        return sendError(res, 400, err instanceof Error ? err.message : 'bad request');
      }
      return runCli(ctx, res, buildEditArgv(id, body.patch ?? {}));
    }
    if (method === 'DELETE') return runCli(ctx, res, ['cron', 'remove', id]);
  }

  return sendError(res, 405, 'method not allowed');
}

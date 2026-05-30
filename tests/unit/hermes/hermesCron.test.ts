/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/process/hermes/hermesHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/process/hermes/hermesHttp')>();
  return {
    ...actual,
    runHermesCli: vi.fn().mockResolvedValue({
      command: 'hermes',
      args: [],
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      timedOut: false,
    }),
  };
});

import { handleCron } from '@/process/hermes/hermesCron';
import { runHermesCli } from '@/process/hermes/hermesHttp';

const runHermesCliMock = vi.mocked(runHermesCli);

function mkReq(url: string, method = 'GET', body?: string) {
  const r: any = Object.assign(new EventEmitter(), { url, method });
  if (body !== undefined) {
    queueMicrotask(() => {
      r.emit('data', Buffer.from(body));
      r.emit('end');
    });
  } else {
    queueMicrotask(() => r.emit('end'));
  }
  return r;
}

function mkRes() {
  const r: any = { status: 0, body: '', headers: {} };
  r.writeHead = (s: number, h?: any) => {
    r.status = s;
    if (h) r.headers = h;
    return r;
  };
  r.end = (b?: string) => {
    if (b) r.body = b;
  };
  return r;
}

const JOBS_JSON = JSON.stringify({
  jobs: [
    {
      id: 'job1',
      name: 'J1',
      enabled: true,
      state: 'active',
      schedule: { display: '0 8 * * *', expr: '0 8 * * *', kind: 'cron' },
      schedule_display: '0 8 * * *',
      repeat: { completed: 3, times: null },
      next_run_at: '2026-06-01T08:00:00',
      last_run_at: '2026-05-30T08:00:00',
      last_status: 'ok',
      deliver: 'local',
      skills: [],
    },
    {
      id: 'job2',
      name: 'J2',
      enabled: false,
      state: 'paused',
      schedule: { display: '30m', expr: '30m', kind: 'every' },
      repeat: { completed: 0, times: 5 },
      last_status: 'ok',
      skills: ['x'],
    },
    {
      id: 'job3',
      name: 'J3',
      enabled: true,
      state: 'active',
      last_status: 'error',
      last_error: 'boom',
      skills: [],
    },
  ],
});

let home: string;
let ctx: { hermesHome: string; hermesBin: string; cliTimeoutMs: number };

function mkUrl(p: string): URL {
  return new URL('http://x' + p);
}

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-'));
  await fs.mkdir(path.join(home, 'cron'), { recursive: true });
  await fs.writeFile(path.join(home, 'cron', 'jobs.json'), JOBS_JSON, 'utf-8');
  ctx = { hermesHome: home, hermesBin: 'hermes', cliTimeoutMs: 5000 };
});

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('handleCron', () => {
  it('GET lists jobs with summary counts and mapped fields', async () => {
    const req = mkReq('/api/agents/hermes/cron/jobs', 'GET');
    const res = mkRes();
    const path0 = '/api/agents/hermes/cron/jobs';

    const handled = await handleCron(ctx, req, res, mkUrl(path0), 'GET');

    expect(handled).toBe(true);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jobs).toHaveLength(3);
    expect(body.total).toBe(3);
    expect(body.paused).toBe(1);
    expect(body.errors).toBe(1);
    expect(body.active).toBe(1);

    const first = body.jobs[0];
    expect(first.schedule_display).toBe('0 8 * * *');
    expect(first.schedule_kind).toBe('cron');
    expect(first.schedule_expr).toBe('0 8 * * *');
    expect(first.repeat_completed).toBe(3);
    expect(first.repeat_times).toBeNull();
  });

  it('POST creates a job and shells out via runHermesCli', async () => {
    const payload = JSON.stringify({ schedule: '30m', prompt: 'do it', name: 'N', skills: ['s1', 's2'] });
    const p = '/api/agents/hermes/cron/jobs';
    const req = mkReq(p, 'POST', payload);
    const res = mkRes();

    const handled = await handleCron(ctx, req, res, mkUrl(p), 'POST');

    expect(handled).toBe(true);
    expect(res.status).toBe(200);
    expect(runHermesCliMock).toHaveBeenCalledTimes(1);

    const args = runHermesCliMock.mock.calls[0][1] as string[];
    expect(args.slice(0, 4)).toEqual(['cron', 'create', '30m', 'do it']);
    expect(args).toContain('--name');
    expect(args[args.indexOf('--name') + 1]).toBe('N');
    const skillFlags = args.reduce<string[]>((acc, v, i) => {
      if (v === '--skill') acc.push(args[i + 1]);
      return acc;
    }, []);
    expect(skillFlags).toEqual(['s1', 's2']);

    const body = JSON.parse(res.body);
    expect(body.result).toBeDefined();
  });

  it('POST /:id/run runs the job', async () => {
    const p = '/api/agents/hermes/cron/jobs/job1/run';
    const req = mkReq(p, 'POST');
    const res = mkRes();

    await handleCron(ctx, req, res, mkUrl(p), 'POST');

    expect(res.status).toBe(200);
    expect(runHermesCliMock).toHaveBeenCalledTimes(1);
    expect(runHermesCliMock.mock.calls[0][1]).toEqual(['cron', 'run', 'job1']);
  });

  it('POST /:id/pause and /:id/resume', async () => {
    const pausePath = '/api/agents/hermes/cron/jobs/job1/pause';
    const pauseRes = mkRes();
    await handleCron(ctx, mkReq(pausePath, 'POST'), pauseRes, mkUrl(pausePath), 'POST');
    expect(pauseRes.status).toBe(200);
    expect(runHermesCliMock.mock.calls[0][1]).toEqual(['cron', 'pause', 'job1']);

    vi.clearAllMocks();

    const resumePath = '/api/agents/hermes/cron/jobs/job1/resume';
    const resumeRes = mkRes();
    await handleCron(ctx, mkReq(resumePath, 'POST'), resumeRes, mkUrl(resumePath), 'POST');
    expect(resumeRes.status).toBe(200);
    expect(runHermesCliMock.mock.calls[0][1]).toEqual(['cron', 'resume', 'job1']);
  });

  it('PATCH /:id edits the job', async () => {
    const payload = JSON.stringify({ patch: { name: 'NN', clear_skills: true } });
    const p = '/api/agents/hermes/cron/jobs/job1';
    const req = mkReq(p, 'PATCH', payload);
    const res = mkRes();

    await handleCron(ctx, req, res, mkUrl(p), 'PATCH');

    expect(res.status).toBe(200);
    expect(runHermesCliMock).toHaveBeenCalledTimes(1);
    const args = runHermesCliMock.mock.calls[0][1] as string[];
    expect(args.slice(0, 3)).toEqual(['cron', 'edit', 'job1']);
    expect(args).toContain('--name');
    expect(args[args.indexOf('--name') + 1]).toBe('NN');
    expect(args).toContain('--clear-skills');
  });

  it('DELETE /:id removes the job', async () => {
    const p = '/api/agents/hermes/cron/jobs/job1';
    const req = mkReq(p, 'DELETE');
    const res = mkRes();

    await handleCron(ctx, req, res, mkUrl(p), 'DELETE');

    expect(res.status).toBe(200);
    expect(runHermesCliMock).toHaveBeenCalledTimes(1);
    expect(runHermesCliMock.mock.calls[0][1]).toEqual(['cron', 'remove', 'job1']);
  });

  it('rejects an invalid job id with 400', async () => {
    const p = '/api/agents/hermes/cron/jobs/bad%3Bid/run';
    const url = mkUrl(p);
    // The id segment contains a char outside /^[A-Za-z0-9_-]+$/ (the ';' encoded
    // as %3B, or the '%' itself), so the handler must reject it.
    expect(url.pathname).toContain('bad%3Bid');
    const req = mkReq(p, 'POST');
    const res = mkRes();

    await handleCron(ctx, req, res, url, 'POST');

    expect(res.status).toBe(400);
    expect(runHermesCliMock).not.toHaveBeenCalled();
  });
});

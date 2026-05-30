/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/process/hermes/hermesHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/process/hermes/hermesHttp')>();
  return {
    ...actual,
    runHermesCli: vi.fn(async (_bin: string, args: string[]) => ({
      command: 'hermes',
      args,
      exitCode: 0,
      stdout: 'OUT:' + args.join(' '),
      stderr: '',
      timedOut: false,
    })),
  };
});

import { handleCliConfig } from '@/process/hermes/hermesCliConfig';
import { runHermesCli } from '@/process/hermes/hermesHttp';

const ctx = { hermesHome: '/tmp/fake-home', hermesBin: 'hermes', cliTimeoutMs: 5000 };

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

describe('handleCliConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns 200 with config, commands and overview', async () => {
    const req = mkReq('/cli/config', 'GET');
    const res = mkRes();
    const handled = await handleCliConfig(ctx, req, res, 'GET');

    expect(handled).toBe(true);
    expect(res.status).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.cliPath).toBe('hermes');
    expect(body.hermesHome).toBe('/tmp/fake-home');
    expect(typeof body.configPath).toBe('string');
    expect(typeof body.envPath).toBe('string');

    expect(Array.isArray(body.commands)).toBe(true);
    expect(body.commands.length).toBeGreaterThan(0);
    for (const cmd of body.commands) {
      expect(typeof cmd.id).toBe('string');
      expect(typeof cmd.label).toBe('string');
      expect(typeof cmd.description).toBe('string');
      expect(Array.isArray(cmd.args)).toBe(true);
      expect(typeof cmd.category).toBe('string');
    }

    expect(body.overview).toBeDefined();
    expect(body.overview.version.exitCode).toBe(0);
    expect(body.overview.status.exitCode).toBe(0);
    expect(body.overview.config.exitCode).toBe(0);
  });

  it('POST with valid command_id runs the CLI and returns the result', async () => {
    const req = mkReq('/cli/config', 'POST', JSON.stringify({ command_id: 'status' }));
    const res = mkRes();
    const handled = await handleCliConfig(ctx, req, res, 'POST');

    expect(handled).toBe(true);
    expect(res.status).toBe(200);

    expect(runHermesCli).toHaveBeenCalledWith('hermes', ['status'], 5000);

    const body = JSON.parse(res.body);
    expect(body.command.id).toBe('status');
    expect(body.result).toBeDefined();
    expect(body.result.args).toEqual(['status']);
  });

  it('POST with unknown command_id returns 400', async () => {
    const req = mkReq('/cli/config', 'POST', JSON.stringify({ command_id: 'does-not-exist' }));
    const res = mkRes();
    const handled = await handleCliConfig(ctx, req, res, 'POST');

    expect(handled).toBe(true);
    expect(res.status).toBe(400);
  });

  it('POST skills-list runs the nested args ["skills","list"]', async () => {
    const req = mkReq('/cli/config', 'POST', JSON.stringify({ command_id: 'skills-list' }));
    const res = mkRes();
    const handled = await handleCliConfig(ctx, req, res, 'POST');

    expect(handled).toBe(true);
    expect(res.status).toBe(200);
    expect(runHermesCli).toHaveBeenCalledWith('hermes', ['skills', 'list'], 5000);
  });

  it('DELETE returns 405', async () => {
    const req = mkReq('/cli/config', 'DELETE');
    const res = mkRes();
    const handled = await handleCliConfig(ctx, req, res, 'DELETE');

    expect(handled).toBe(true);
    expect(res.status).toBe(405);
  });
});

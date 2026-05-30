/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleSessions } from '@/process/hermes/hermesSessions';
import type { HermesSessionsResponse } from '@/common/types/hermes/hermesExt';

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

const SESSION_A = JSON.stringify({
  session_id: 'a1',
  model: 'gpt-5',
  platform: 'cli',
  session_start: '2026-05-01T10:00:00',
  last_updated: '2026-05-02T10:00:00',
  message_count: 2,
  messages: [
    { role: 'user', content: 'Hello there friend' },
    { role: 'assistant', content: 'hi' },
  ],
});

const SESSION_B = JSON.stringify({
  session_id: 'b2',
  model: 'claude',
  platform: 'discord',
  session_start: '2026-05-03T10:00:00',
  last_updated: '2026-05-04T10:00:00',
  message_count: 1,
  messages: [{ role: 'user', content: 'Second session topic' }],
});

describe('handleSessions', () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  async function writeGoodSessions() {
    const dir = path.join(home, 'sessions');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'session_a.json'), SESSION_A, 'utf-8');
    await fs.writeFile(path.join(dir, 'session_b.json'), SESSION_B, 'utf-8');
  }

  it('returns 200 with both sessions', async () => {
    await writeGoodSessions();
    const res = mkRes();
    await handleSessions(home, res);

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as HermesSessionsResponse;
    expect(body.sessions).toHaveLength(2);
  });

  it('sorts by last_updated descending (b2 newest first)', async () => {
    await writeGoodSessions();
    const res = mkRes();
    await handleSessions(home, res);

    const body = JSON.parse(res.body) as HermesSessionsResponse;
    expect(body.sessions[0].id).toBe('b2');
    expect(body.sessions[1].id).toBe('a1');
  });

  it('builds a summary with id, model, platform, timestamps, path and derived title', async () => {
    await writeGoodSessions();
    const res = mkRes();
    await handleSessions(home, res);

    const body = JSON.parse(res.body) as HermesSessionsResponse;
    const b2 = body.sessions.find((s) => s.id === 'b2');
    expect(b2).toBeDefined();
    expect(b2!.model).toBe('claude');
    expect(b2!.platform).toBe('discord');
    expect(b2!.session_start).toBe('2026-05-03T10:00:00');
    expect(b2!.last_updated).toBe('2026-05-04T10:00:00');
    expect(b2!.path).toBe(path.join(home, 'sessions', 'session_b.json'));
    expect(b2!.title).toContain('Second session topic');

    const a1 = body.sessions.find((s) => s.id === 'a1');
    expect(a1!.title).toContain('Hello there friend');
  });

  it('returns 200 with empty list when the sessions dir is missing', async () => {
    // no sessions dir created
    const res = mkRes();
    await handleSessions(home, res);

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as HermesSessionsResponse;
    expect(body.sessions).toEqual([]);
  });

  it('skips malformed JSON files and still returns the good sessions', async () => {
    await writeGoodSessions();
    await fs.writeFile(path.join(home, 'sessions', 'session_bad.json'), 'not json', 'utf-8');

    const res = mkRes();
    await handleSessions(home, res);

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as HermesSessionsResponse;
    expect(body.sessions).toHaveLength(2);
    const ids = body.sessions.map((s) => s.id).sort();
    expect(ids).toEqual(['a1', 'b2']);
  });
});

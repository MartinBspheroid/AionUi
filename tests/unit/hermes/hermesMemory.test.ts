/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleMemory, memoryPaths } from '@/process/hermes/hermesMemory';

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

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const tmpDirs: string[] = [];

async function makeHome(withMemories: boolean): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-'));
  tmpDirs.push(home);
  if (withMemories) {
    const dir = path.join(home, 'memories');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'MEMORY.md'), 'm-content', 'utf-8');
    await fs.writeFile(path.join(dir, 'USER.md'), 'u-content', 'utf-8');
  }
  return home;
}

afterEach(async () => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('hermesMemory', () => {
  it('memoryPaths returns MEMORY.md and USER.md under <home>/memories', () => {
    const home = '/some/home';
    const paths = memoryPaths(home);
    expect(paths).toEqual({
      memory: path.join(home, 'memories', 'MEMORY.md'),
      user: path.join(home, 'memories', 'USER.md'),
    });
  });

  it('GET returns 200 with file contents and ISO mtimes', async () => {
    const home = await makeHome(true);
    const req = mkReq('/api/memory', 'GET');
    const res = mkRes();

    await handleMemory(home, req, res, 'GET');

    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload.memory).toBe('m-content');
    expect(payload.user).toBe('u-content');
    expect(payload.memory_mtime).toMatch(ISO_RE);
    expect(payload.user_mtime).toMatch(ISO_RE);
  });

  it('GET with no files returns 200 with empty content and no throw', async () => {
    const home = await makeHome(false);
    const req = mkReq('/api/memory', 'GET');
    const res = mkRes();

    await handleMemory(home, req, res, 'GET');

    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload.memory).toBe('');
    expect(payload.user).toBe('');
  });

  it('PUT {memory} returns 204 and updates MEMORY.md, leaves USER.md unchanged', async () => {
    const home = await makeHome(true);
    const req = mkReq('/api/memory', 'PUT', JSON.stringify({ memory: 'new-m' }));
    const res = mkRes();

    await handleMemory(home, req, res, 'PUT');

    expect(res.status).toBe(204);
    const paths = memoryPaths(home);
    expect(await fs.readFile(paths.memory, 'utf-8')).toBe('new-m');
    expect(await fs.readFile(paths.user, 'utf-8')).toBe('u-content');
  });

  it('PUT {user} returns 204 and updates USER.md', async () => {
    const home = await makeHome(true);
    const req = mkReq('/api/memory', 'PUT', JSON.stringify({ user: 'new-u' }));
    const res = mkRes();

    await handleMemory(home, req, res, 'PUT');

    expect(res.status).toBe(204);
    const paths = memoryPaths(home);
    expect(await fs.readFile(paths.user, 'utf-8')).toBe('new-u');
    expect(await fs.readFile(paths.memory, 'utf-8')).toBe('m-content');
  });

  it('DELETE returns 405', async () => {
    const home = await makeHome(true);
    const req = mkReq('/api/memory', 'DELETE');
    const res = mkRes();

    await handleMemory(home, req, res, 'DELETE');

    expect(res.status).toBe(405);
  });
});

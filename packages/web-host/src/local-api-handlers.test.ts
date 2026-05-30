/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { startStaticServer, type LocalApiHandler, type StaticServerHandle } from './static-server.js';

async function mkRendererFixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-localapi-'));
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><title>root</title>');
  return dir;
}

type HttpResult = { status: number; body: string };

function get(port: number, urlPath: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

// An unused TCP port: bind to :0, read the assigned port, then close. The port
// is free again immediately, so the static server's backend proxy will fail to
// connect there (502) — exactly the "no backend running" condition we want.
async function unusedPort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
  const p = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return p;
}

describe('static-server localApiHandlers', () => {
  let handle: StaticServerHandle | null = null;
  let staticDir = '';

  const pingHandler: LocalApiHandler = (req, res) => {
    if (req.url === '/api/agents/hermes/ping') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ pong: true }));
      return true;
    }
    return false;
  };

  beforeEach(async () => {
    staticDir = await mkRendererFixture();
    handle = await startStaticServer({
      staticDir,
      backendPort: await unusedPort(),
      port: 0,
      allowRemote: false,
      localApiHandlers: [pingHandler],
    });
  });

  afterEach(async () => {
    if (handle) {
      await handle.stop();
      handle = null;
    }
    await fs.rm(staticDir, { recursive: true, force: true });
  });

  it('runs the local handler before the proxy and short-circuits when it returns true', async () => {
    const res = await get(handle!.port, '/api/agents/hermes/ping');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ pong: true });
  });

  it('falls through to static serving when the handler returns false', async () => {
    const res = await get(handle!.port, '/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('<title>root</title>');
  });

  it('falls through to the backend proxy for unclaimed /api paths (not handled locally)', async () => {
    // No backend is listening, so the proxy returns 502 — but crucially the
    // local handler must NOT have claimed this path with its 200/{pong:true}.
    const res = await get(handle!.port, '/api/other/thing');
    expect(res.status).not.toBe(200);
    expect(() => JSON.parse(res.body)).not.toThrow();
    expect(JSON.parse(res.body)).not.toEqual({ pong: true });
  });
});

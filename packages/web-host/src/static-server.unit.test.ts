import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { startStaticServer, type StaticServerHandle } from './static-server.js';

async function mkRendererFixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-static-'));
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><title>root</title>');
  await fs.mkdir(path.join(dir, 'assets'));
  await fs.writeFile(path.join(dir, 'assets', 'main.js'), 'console.log("hi")');
  return dir;
}

async function startMockBackend(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe('static-server', () => {
  let handle: StaticServerHandle | null = null;
  let stopBackend: (() => Promise<void>) | null = null;
  let staticDir = '';

  beforeEach(async () => {
    staticDir = await mkRendererFixture();
  });

  afterEach(async () => {
    if (handle) {
      await handle.stop();
      handle = null;
    }
    if (stopBackend) {
      await stopBackend();
      stopBackend = null;
    }
    await fs.rm(staticDir, { recursive: true, force: true });
  });

  it('serves static index.html at /', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/`);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain('<title>root</title>');
  });

  it('SPA fallback: /chat/123 returns index.html', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/chat/123`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<title>root</title>');
  });

  it('static asset /assets/main.js served', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/assets/main.js`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('hi');
  });

  it('/api/* reverse-proxies to backend', async () => {
    const backend = await startMockBackend((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, method: req.method }));
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/api/anything`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { path: string };
    expect(json.path).toBe('/api/anything');
  });

  it('/login reverse-proxies to backend (no local handler)', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/login' && req.method === 'POST') {
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': 'aionui-session=backend-token; Path=/; HttpOnly',
        });
        res.end(JSON.stringify({ success: true, proxied: true }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'anything' }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/aionui-session=backend-token/);
    const json = (await r.json()) as { proxied: boolean };
    expect(json.proxied).toBe(true);
  });

  it('/api/auth/user reverse-proxies to backend (no local handler)', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/api/auth/user' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: { username: 'from-backend', id: 'from-backend' } }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/api/auth/user`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { user: { username: string } };
    expect(json.user.username).toBe('from-backend');
  });

  it('/logout reverse-proxies to backend (no local handler)', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/logout' && req.method === 'POST') {
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': 'aionui-session=; Path=/; Max-Age=0',
        });
        res.end(JSON.stringify({ success: true, proxied: true }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/logout`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  it('/api proxy returns 502 when backend unreachable', async () => {
    // allocate a port then free it
    const placeholder = await startMockBackend((_req, res) => res.end());
    const freePort = placeholder.port;
    await placeholder.close();

    handle = await startStaticServer({ staticDir, backendPort: freePort, port: 0 });
    const r = await fetch(`${handle.localUrl}/api/anything`);
    expect(r.status).toBe(502);
  });

  it('/api/agents/hermes/memory requires authenticated backend status', async () => {
    const hermesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-home-'));
    const oldHome = process.env.HERMES_HOME;
    process.env.HERMES_HOME = hermesHome;
    try {
      const backend = await startMockBackend((req, res) => {
        if (req.url === '/api/auth/status') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true, is_authenticated: false }));
          return;
        }
        res.writeHead(404).end();
      });
      stopBackend = backend.close;
      handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

      const r = await fetch(`${handle.localUrl}/api/agents/hermes/memory`);
      expect(r.status).toBe(401);
      const json = (await r.json()) as { code: string };
      expect(json.code).toBe('UNAUTHENTICATED');
    } finally {
      if (oldHome === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = oldHome;
      await fs.rm(hermesHome, { recursive: true, force: true });
    }
  });

  it('/api/agents/hermes/sessions requires authenticated backend status', async () => {
    const hermesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-home-'));
    const oldHome = process.env.HERMES_HOME;
    process.env.HERMES_HOME = hermesHome;
    try {
      const backend = await startMockBackend((req, res) => {
        if (req.url === '/api/auth/status') {
          expect(req.headers.cookie).toBe('aionui-session=test');
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true, is_authenticated: false }));
          return;
        }
        res.writeHead(404).end();
      });
      stopBackend = backend.close;
      handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

      const r = await fetch(`${handle.localUrl}/api/agents/hermes/sessions`, {
        headers: { cookie: 'aionui-session=test' },
      });
      expect(r.status).toBe(401);
      const json = (await r.json()) as { code: string };
      expect(json.code).toBe('UNAUTHENTICATED');
    } finally {
      if (oldHome === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = oldHome;
      await fs.rm(hermesHome, { recursive: true, force: true });
    }
  });

  it('/api/agents/hermes/sessions lists authenticated Hermes session summaries defensively', async () => {
    const hermesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-home-'));
    const oldHome = process.env.HERMES_HOME;
    process.env.HERMES_HOME = hermesHome;
    const sessionsDir = path.join(hermesHome, 'sessions');
    await fs.mkdir(sessionsDir);
    await fs.writeFile(
      path.join(sessionsDir, 'older.json'),
      JSON.stringify({
        session_id: 'session-older',
        title: 'Older title',
        model: 'claude-3-5',
        platform: 'hermes',
        session_start: '2026-05-01T10:00:00.000Z',
        last_updated: '2026-05-01T11:00:00.000Z',
        messages: [{ role: 'system', content: 'hidden' }],
      })
    );
    await fs.writeFile(
      path.join(sessionsDir, 'newer.json'),
      JSON.stringify({
        model_id: 'gpt-5',
        provider: 'gateway',
        messages: [{ role: 'user', content: 'Build the next parity slice with care' }],
        last_updated: '2026-05-03T11:00:00.000Z',
      })
    );
    await fs.writeFile(path.join(sessionsDir, 'corrupt.json'), '{not json');
    try {
      const backend = await startMockBackend((req, res) => {
        if (req.url === '/api/auth/status') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true, is_authenticated: true }));
          return;
        }
        res.writeHead(404).end();
      });
      stopBackend = backend.close;
      handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

      const r = await fetch(`${handle.localUrl}/api/agents/hermes/sessions?limit=100`, {
        headers: { cookie: 'aionui-session=test' },
      });
      expect(r.status).toBe(200);
      const json = (await r.json()) as {
        data: {
          sessions: Array<{
            id: string;
            title?: string;
            model?: string;
            platform?: string;
            last_updated?: string;
            messages?: unknown;
            system_prompt?: unknown;
          }>;
        };
      };
      expect(json.data.sessions).toHaveLength(2);
      expect(json.data.sessions[0]).toMatchObject({
        id: 'newer',
        title: 'Build the next parity slice with care',
        model: 'gpt-5',
        platform: 'gateway',
        last_updated: '2026-05-03T11:00:00.000Z',
      });
      expect(json.data.sessions[1]).toMatchObject({ id: 'session-older', title: 'Older title' });
      expect(json.data.sessions[0].messages).toBeUndefined();
      expect(json.data.sessions[0].system_prompt).toBeUndefined();
    } finally {
      if (oldHome === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = oldHome;
      await fs.rm(hermesHome, { recursive: true, force: true });
    }
  });

  it('/api/agents/hermes/cron/jobs requires authenticated backend status', async () => {
    const hermesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-home-'));
    const oldHome = process.env.HERMES_HOME;
    process.env.HERMES_HOME = hermesHome;
    try {
      const backend = await startMockBackend((req, res) => {
        if (req.url === '/api/auth/status') {
          expect(req.headers.cookie).toBe('aionui-session=test');
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true, is_authenticated: false }));
          return;
        }
        res.writeHead(404).end();
      });
      stopBackend = backend.close;
      handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

      const r = await fetch(`${handle.localUrl}/api/agents/hermes/cron/jobs`, {
        headers: { cookie: 'aionui-session=test' },
      });
      expect(r.status).toBe(401);
      const json = (await r.json()) as { code: string };
      expect(json.code).toBe('UNAUTHENTICATED');
    } finally {
      if (oldHome === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = oldHome;
      await fs.rm(hermesHome, { recursive: true, force: true });
    }
  });

  it('/api/agents/hermes/cron/jobs lists authenticated Hermes cron jobs without prompts', async () => {
    const hermesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-home-'));
    const oldHome = process.env.HERMES_HOME;
    process.env.HERMES_HOME = hermesHome;
    const cronDir = path.join(hermesHome, 'cron');
    await fs.mkdir(cronDir, { recursive: true });
    await fs.writeFile(
      path.join(cronDir, 'jobs.json'),
      JSON.stringify({
        jobs: [
          {
            id: 'paused-job',
            name: 'Paused report',
            prompt: 'sensitive long prompt',
            enabled: false,
            state: 'paused',
            schedule: { kind: 'cron', expr: '0 8 * * *', display: '0 8 * * *' },
            repeat: { completed: 3, times: null },
            last_status: 'ok',
            deliver: 'local',
          },
          {
            id: 'active-error',
            name: 'Active failing script',
            enabled: true,
            state: 'scheduled',
            schedule_display: 'every 180m',
            schedule: { kind: 'interval', minutes: 180, display: 'every 180m' },
            repeat: { completed: 7, times: 9 },
            next_run_at: '2026-05-03T11:00:00.000Z',
            last_run_at: '2026-05-03T10:00:00.000Z',
            last_status: 'error',
            last_error: 'Script exited with code 1',
            deliver: 'local',
            script: 'job.py',
            no_agent: true,
            skills: ['example-skill'],
          },
        ],
      })
    );
    try {
      const backend = await startMockBackend((req, res) => {
        if (req.url === '/api/auth/status') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true, is_authenticated: true }));
          return;
        }
        res.writeHead(404).end();
      });
      stopBackend = backend.close;
      handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

      const r = await fetch(`${handle.localUrl}/api/agents/hermes/cron/jobs?limit=100`, {
        headers: { cookie: 'aionui-session=test' },
      });
      expect(r.status).toBe(200);
      const json = (await r.json()) as {
        data: {
          total: number;
          active: number;
          paused: number;
          errors: number;
          jobs: Array<{
            id: string;
            prompt?: unknown;
            schedule_display?: string;
            script?: string;
            repeat_times?: number | null;
          }>;
        };
      };
      expect(json.data).toMatchObject({ total: 2, active: 1, paused: 1, errors: 1 });
      expect(json.data.jobs[0]).toMatchObject({
        id: 'active-error',
        schedule_display: 'every 180m',
        script: 'job.py',
        repeat_times: 9,
      });
      expect(json.data.jobs[0].prompt).toBeUndefined();
      expect(json.data.jobs[1]).toMatchObject({ id: 'paused-job', repeat_times: null });
    } finally {
      if (oldHome === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = oldHome;
      await fs.rm(hermesHome, { recursive: true, force: true });
    }
  });

  it('/api/agents/hermes/memory reads and writes Hermes memory files when authenticated', async () => {
    const hermesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-home-'));
    const oldHome = process.env.HERMES_HOME;
    process.env.HERMES_HOME = hermesHome;
    const memoryDir = path.join(hermesHome, 'memories');
    await fs.mkdir(memoryDir);
    await fs.writeFile(path.join(memoryDir, 'MEMORY.md'), 'old memory');
    await fs.writeFile(path.join(memoryDir, 'USER.md'), 'old user');
    try {
      const backend = await startMockBackend((req, res) => {
        if (req.url === '/api/auth/status') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true, is_authenticated: true }));
          return;
        }
        res.writeHead(404).end();
      });
      stopBackend = backend.close;
      handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

      const readBefore = await fetch(`${handle.localUrl}/api/agents/hermes/memory`, {
        headers: { cookie: 'aionui-session=test' },
      });
      expect(readBefore.status).toBe(200);
      await expect(readBefore.json()).resolves.toMatchObject({ data: { memory: 'old memory', user: 'old user' } });

      const write = await fetch(`${handle.localUrl}/api/agents/hermes/memory`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: 'aionui-session=test' },
        body: JSON.stringify({ memory: 'new memory', user: 'new user' }),
      });
      expect(write.status).toBe(200);
      await expect(fs.readFile(path.join(memoryDir, 'MEMORY.md'), 'utf8')).resolves.toBe('new memory');
      await expect(fs.readFile(path.join(memoryDir, 'USER.md'), 'utf8')).resolves.toBe('new user');
    } finally {
      if (oldHome === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = oldHome;
      await fs.rm(hermesHome, { recursive: true, force: true });
    }
  });

  it('/api/agents/hermes/cli-config exposes authenticated redacted CLI overview and allowlisted commands', async () => {
    const hermesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-home-'));
    const fakeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-hermes-cli-'));
    const fakeCli = path.join(fakeDir, 'hermes');
    const oldHome = process.env.HERMES_HOME;
    const oldCli = process.env.HERMES_CLI_PATH;
    process.env.HERMES_HOME = hermesHome;
    process.env.HERMES_CLI_PATH = fakeCli;
    await fs.writeFile(
      fakeCli,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(' ') === '--version') console.log('hermes 9.9.9');
else if (args.join(' ') === 'config path') console.log(process.env.HERMES_HOME + '/config.yaml');
else if (args.join(' ') === 'config env-path') console.log(process.env.HERMES_HOME + '/.env');
else if (args.join(' ') === 'status') console.log('  OpenAI        ✓ sk-proj-secret-token\\n  Kimi          ✓ sk-kimi-secret-token');
else if (args.join(' ') === 'config show') console.log('model:\\n  api_key: sk-proj-secret-token\\nparallel: M4eF...3_kU');
else if (args.join(' ') === 'tools list') console.log('terminal enabled');
else if (args.includes('--help')) console.log('usage: hermes ' + args.join(' '));
else console.log('ran ' + args.join(' '));
`
    );
    await fs.chmod(fakeCli, 0o755);
    try {
      const backend = await startMockBackend((req, res) => {
        if (req.url === '/api/auth/status') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true, is_authenticated: true }));
          return;
        }
        res.writeHead(404).end();
      });
      stopBackend = backend.close;
      handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

      const overviewResponse = await fetch(`${handle.localUrl}/api/agents/hermes/cli-config`, {
        headers: { cookie: 'aionui-session=test' },
      });
      expect(overviewResponse.status).toBe(200);
      const overview = (await overviewResponse.json()) as {
        data: {
          configPath: string;
          envPath: string;
          commands: Array<{ id: string }>;
          overview: { status: { stdout: string }; config: { stdout: string } };
        };
      };
      expect(overview.data.configPath).toBe(`${hermesHome}/config.yaml`);
      expect(overview.data.envPath).toBe(`${hermesHome}/.env`);
      expect(overview.data.commands.some((command) => command.id === 'tools-list')).toBe(true);
      expect(overview.data.overview.status.stdout).toContain('[REDACTED]');
      expect(overview.data.overview.status.stdout).not.toContain('sk-proj-secret-token');
      expect(overview.data.overview.config.stdout).not.toContain('sk-proj-secret-token');

      const runResponse = await fetch(`${handle.localUrl}/api/agents/hermes/cli-config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'aionui-session=test' },
        body: JSON.stringify({ command_id: 'tools-list' }),
      });
      expect(runResponse.status).toBe(200);
      const run = (await runResponse.json()) as { data: { command: { id: string }; result: { stdout: string } } };
      expect(run.data.command.id).toBe('tools-list');
      expect(run.data.result.stdout).toContain('terminal enabled');

      const rejected = await fetch(`${handle.localUrl}/api/agents/hermes/cli-config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'aionui-session=test' },
        body: JSON.stringify({ command_id: 'config-set' }),
      });
      expect(rejected.status).toBe(400);
    } finally {
      if (oldHome === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = oldHome;
      if (oldCli === undefined) delete process.env.HERMES_CLI_PATH;
      else process.env.HERMES_CLI_PATH = oldCli;
      await fs.rm(hermesHome, { recursive: true, force: true });
      await fs.rm(fakeDir, { recursive: true, force: true });
    }
  });

  it('/ws WebSocket upgrade is spliced to backend and 101 is relayed', async () => {
    // Mock backend that accepts any WebSocket upgrade and replies with 101.
    // We don't run a real ws protocol — just verify the upgrade response makes
    // it back through the TCP-splice proxy. This is the exact regression path
    // that bun 1.3's http-compat upgrade handler broke.
    const { createHash } = await import('node:crypto');
    const net = await import('node:net');
    const httpMod = await import('node:http');
    const backendServer = httpMod.createServer();
    backendServer.on('upgrade', (req, socket) => {
      const wsKey = (req.headers['sec-websocket-key'] as string) || '';
      const accept = createHash('sha1')
        .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      socket.write('Upgrade: websocket\r\n');
      socket.write('Connection: Upgrade\r\n');
      socket.write(`Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
      // Send a single 0-length WS text frame as a liveness marker then close.
      socket.write(Buffer.from([0x81, 0x00]));
      socket.end();
    });
    await new Promise<void>((r) => backendServer.listen(0, '127.0.0.1', () => r()));
    stopBackend = () => new Promise<void>((r) => backendServer.close(() => r()));
    const backendPort = (backendServer.address() as { port: number }).port;

    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    // Speak raw HTTP/1.1 upgrade over a TCP socket against the public listener.
    const { port: publicPort } = handle;
    const status: string = await new Promise((resolve, reject) => {
      const sock = net.connect({ host: '127.0.0.1', port: publicPort }, () => {
        sock.write(
          'GET /ws HTTP/1.1\r\n' +
            `Host: 127.0.0.1:${publicPort}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n'
        );
      });
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const headEnd = buf.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const firstLine = buf.slice(0, buf.indexOf(0x0a)).toString('ascii');
          sock.destroy();
          resolve(firstLine.trim());
        }
      });
      sock.on('error', reject);
      setTimeout(() => {
        sock.destroy();
        reject(new Error('timeout waiting for 101'));
      }, 3000).unref();
    });
    expect(status).toMatch(/HTTP\/1\.1 101/i);
  });

  it('network URL populated only when allowRemote=true', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    const h1 = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      allowRemote: false,
    });
    expect(h1.networkUrl).toBeUndefined();
    await h1.stop();

    const h2 = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      allowRemote: true,
    });
    // may still be undefined on CI machines without a LAN interface
    expect(typeof h2.networkUrl === 'string' || h2.networkUrl === undefined).toBe(true);
    await h2.stop();
  });
});

/**
 * WebUI static server.
 *
 * Serves out/renderer/ as the SPA and reverse-proxies /api/*, /ws, /login and
 * /logout to aioncore. All auth goes to backend's aionui-auth crate;
 * /login and /logout are aionui-auth's top-level paths, the rest live under
 * /api/auth/*.
 *
 * Design: Node native http + serve-handler. No Express. Most business routes
 * remain in aioncore; host-level routes are limited to WebUI-only integration
 * shims that need local filesystem access before the generic /api/* proxy.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { homedir, networkInterfaces } from 'node:os';
import net, { type Socket } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import serveHandler from 'serve-handler';

export type StaticServerOptions = {
  staticDir: string;
  backendPort: number;
  port?: number;
  allowRemote?: boolean;
};

export type StaticServerHandle = {
  port: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  stop: () => Promise<void>;
};

const DEFAULT_PORT = 25808;
const execFileAsync = promisify(execFile);

function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function forwardToBackend(req: IncomingMessage, res: ServerResponse, backendPort: number): void {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: backendPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
  };
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'BACKEND_UNREACHABLE' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(proxy);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return undefined;
  return JSON.parse(raw) as unknown;
}

async function isAuthenticated(req: IncomingMessage, backendPort: number): Promise<boolean> {
  return new Promise((resolve) => {
    const authReq = http.request(
      {
        hostname: '127.0.0.1',
        port: backendPort,
        path: '/api/auth/status',
        method: 'GET',
        headers: {
          cookie: req.headers.cookie ?? '',
          accept: 'application/json',
        },
      },
      (authRes) => {
        const chunks: Buffer[] = [];
        authRes.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        authRes.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { is_authenticated?: unknown };
            resolve(authRes.statusCode === 200 && json.is_authenticated === true);
          } catch {
            resolve(false);
          }
        });
      }
    );
    authReq.on('error', () => resolve(false));
    authReq.end();
  });
}

async function readFirstExistingTextFileOrEmpty(filePaths: string[]): Promise<{ content: string; mtime?: string }> {
  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const [content, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
        return { exists: true, content, mtime: stat.mtime.toISOString() };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, content: '', mtime: undefined };
        throw error;
      }
    })
  );
  const found = results.find((result) => result.exists);
  return found ? { content: found.content, mtime: found.mtime } : { content: '' };
}

function getHermesHome(): string {
  return process.env.HERMES_HOME || path.join(homedir(), '.hermes');
}

function getHermesMemoryPaths(hermesHome = getHermesHome()): {
  memoryPath: string;
  userPath: string;
  legacyMemoryPath: string;
  legacyUserPath: string;
} {
  const memoryDir = process.env.HERMES_MEMORY_DIR || path.join(hermesHome, 'memories');
  return {
    memoryPath: path.join(memoryDir, 'MEMORY.md'),
    userPath: path.join(memoryDir, 'USER.md'),
    legacyMemoryPath: path.join(hermesHome, 'MEMORY.md'),
    legacyUserPath: path.join(hermesHome, 'USER.md'),
  };
}

type HermesCliCommandSummary = {
  id: string;
  label: string;
  description: string;
  args: string[];
  category: string;
};

type HermesCliRunResult = {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

type HermesCliConfigResponse = {
  hermesHome: string;
  cliPath: string;
  configPath: string;
  envPath: string;
  commands: HermesCliCommandSummary[];
  overview: {
    version?: HermesCliRunResult;
    status?: HermesCliRunResult;
    config?: HermesCliRunResult;
  };
};

const HERMES_CLI_COMMANDS: HermesCliCommandSummary[] = [
  {
    id: 'help',
    label: 'CLI help',
    description: 'Top-level Hermes CLI options and subcommands.',
    args: ['--help'],
    category: 'Help',
  },
  {
    id: 'status',
    label: 'Status',
    description: 'Component status, active provider, auth providers, gateway, jobs, and sessions.',
    args: ['status'],
    category: 'Health',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    description: 'Detailed diagnostics for dependencies and config.',
    args: ['doctor'],
    category: 'Health',
  },
  {
    id: 'config-show',
    label: 'Config: show',
    description: 'Redacted rendered Hermes configuration.',
    args: ['config', 'show'],
    category: 'Config',
  },
  {
    id: 'config-check',
    label: 'Config: check',
    description: 'Check for missing or outdated configuration.',
    args: ['config', 'check'],
    category: 'Config',
  },
  {
    id: 'config-help',
    label: 'Config: help',
    description: 'Hermes config subcommand options.',
    args: ['config', '--help'],
    category: 'Config',
  },
  {
    id: 'config-path',
    label: 'Config: path',
    description: 'Print config.yaml path.',
    args: ['config', 'path'],
    category: 'Config',
  },
  {
    id: 'config-env-path',
    label: 'Config: env path',
    description: 'Print .env path.',
    args: ['config', 'env-path'],
    category: 'Config',
  },
  {
    id: 'model-help',
    label: 'Model: help',
    description: 'Model/provider picker help and options.',
    args: ['model', '--help'],
    category: 'Model',
  },
  {
    id: 'tools-list',
    label: 'Tools: list',
    description: 'List enabled and available Hermes toolsets.',
    args: ['tools', 'list'],
    category: 'Tools & Skills',
  },
  {
    id: 'tools-help',
    label: 'Tools: help',
    description: 'Tool management CLI options.',
    args: ['tools', '--help'],
    category: 'Tools & Skills',
  },
  {
    id: 'skills-list',
    label: 'Skills: list',
    description: 'List installed Hermes skills.',
    args: ['skills', 'list'],
    category: 'Tools & Skills',
  },
  {
    id: 'skills-help',
    label: 'Skills: help',
    description: 'Skill management CLI options.',
    args: ['skills', '--help'],
    category: 'Tools & Skills',
  },
  {
    id: 'mcp-list',
    label: 'MCP: list',
    description: 'List configured MCP servers.',
    args: ['mcp', 'list'],
    category: 'MCP',
  },
  {
    id: 'mcp-help',
    label: 'MCP: help',
    description: 'MCP server CLI options.',
    args: ['mcp', '--help'],
    category: 'MCP',
  },
  {
    id: 'profile-list',
    label: 'Profiles: list',
    description: 'List Hermes profiles.',
    args: ['profile', 'list'],
    category: 'Profiles',
  },
  {
    id: 'profile-help',
    label: 'Profiles: help',
    description: 'Profile CLI options.',
    args: ['profile', '--help'],
    category: 'Profiles',
  },
  {
    id: 'sessions-list',
    label: 'Sessions: list',
    description: 'List recent Hermes sessions.',
    args: ['sessions', 'list'],
    category: 'Sessions',
  },
  {
    id: 'sessions-stats',
    label: 'Sessions: stats',
    description: 'Session store statistics.',
    args: ['sessions', 'stats'],
    category: 'Sessions',
  },
  {
    id: 'sessions-help',
    label: 'Sessions: help',
    description: 'Session CLI options.',
    args: ['sessions', '--help'],
    category: 'Sessions',
  },
  {
    id: 'cron-list',
    label: 'Cron: list',
    description: 'List scheduled Hermes jobs.',
    args: ['cron', 'list'],
    category: 'Tasks',
  },
  {
    id: 'cron-status',
    label: 'Cron: status',
    description: 'Scheduler status.',
    args: ['cron', 'status'],
    category: 'Tasks',
  },
  {
    id: 'cron-help',
    label: 'Cron: help',
    description: 'Cron CLI options.',
    args: ['cron', '--help'],
    category: 'Tasks',
  },
  {
    id: 'auth-list',
    label: 'Auth: list',
    description: 'List credential pool/auth provider status.',
    args: ['auth', 'list'],
    category: 'Auth',
  },
  {
    id: 'auth-help',
    label: 'Auth: help',
    description: 'Credential pool CLI options.',
    args: ['auth', '--help'],
    category: 'Auth',
  },
  {
    id: 'memory-status',
    label: 'Memory: status',
    description: 'Memory provider status.',
    args: ['memory', 'status'],
    category: 'Memory',
  },
  {
    id: 'memory-help',
    label: 'Memory: help',
    description: 'Memory CLI options.',
    args: ['memory', '--help'],
    category: 'Memory',
  },
  {
    id: 'honcho-status',
    label: 'Honcho: status',
    description: 'Honcho memory integration status.',
    args: ['honcho', 'status'],
    category: 'Memory',
  },
  {
    id: 'plugins-list',
    label: 'Plugins: list',
    description: 'List installed/available Hermes plugins.',
    args: ['plugins', 'list'],
    category: 'Extensions',
  },
  {
    id: 'plugins-help',
    label: 'Plugins: help',
    description: 'Plugin CLI options.',
    args: ['plugins', '--help'],
    category: 'Extensions',
  },
  {
    id: 'gateway-status',
    label: 'Gateway: status',
    description: 'Gateway service status.',
    args: ['gateway', 'status'],
    category: 'Gateway',
  },
  {
    id: 'gateway-help',
    label: 'Gateway: help',
    description: 'Gateway CLI options.',
    args: ['gateway', '--help'],
    category: 'Gateway',
  },
  {
    id: 'webhook-list',
    label: 'Webhooks: list',
    description: 'List webhook subscriptions.',
    args: ['webhook', 'list'],
    category: 'Gateway',
  },
  {
    id: 'webhook-help',
    label: 'Webhooks: help',
    description: 'Webhook CLI options.',
    args: ['webhook', '--help'],
    category: 'Gateway',
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'Usage analytics summary.',
    args: ['insights'],
    category: 'Analytics',
  },
];

const HERMES_CLI_COMMANDS_BY_ID = new Map(HERMES_CLI_COMMANDS.map((command) => [command.id, command]));

function getHermesCliPath(): string {
  return process.env.HERMES_CLI_PATH || process.env.HERMES_CLI || 'hermes';
}

function redactHermesOutput(output: string): string {
  const sensitiveProviderLine =
    /^\s{2}(OpenRouter|OpenAI(?: \(STT\/TTS\))?|Google(?: \/ Gemini)?|Gemini|DeepSeek|xAI(?: \/ Grok)?|NVIDIA NIM|Z\.AI \/ GLM|Kimi(?: \/ Moonshot)?|StepFun Step Plan|MiniMax(?:-CN| \(China\))?|Firecrawl|Tavily|Browser Use|Browserbase|FAL|ElevenLabs|GitHub|Anthropic|Parallel)\b/i;
  return output
    .split('\n')
    .map((line) => {
      if (sensitiveProviderLine.test(line) && !/\(not set\)|not configured|not logged in/i.test(line)) {
        return line.replace(/(✓\s*)\S.*$/, '$1[REDACTED]').replace(/\S{3,}\.\.\.\S{3,}/g, '[REDACTED]');
      }
      return line
        .replace(/(api[_-]?key\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
        .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)\S+/gi, '$1[REDACTED]')
        .replace(/((?:access|refresh|auth)[_-]?token\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
        .replace(/(password\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
        .replace(/\bsk_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
    })
    .join('\n');
}

async function runHermesCli(args: string[], timeoutMs = 15000): Promise<HermesCliRunResult> {
  const cliPath = getHermesCliPath();
  try {
    const result = await execFileAsync(cliPath, args, {
      cwd: getHermesHome(),
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, NO_COLOR: process.env.NO_COLOR ?? '1' },
    });
    return {
      command: cliPath,
      args,
      exitCode: 0,
      stdout: redactHermesOutput(result.stdout ?? ''),
      stderr: redactHermesOutput(result.stderr ?? ''),
    };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      signal?: string;
      killed?: boolean;
    };
    return {
      command: cliPath,
      args,
      exitCode: typeof execError.code === 'number' ? execError.code : null,
      stdout: redactHermesOutput(execError.stdout ?? ''),
      stderr: redactHermesOutput(execError.stderr || execError.message || ''),
      timedOut: execError.killed === true || execError.signal === 'SIGTERM',
    };
  }
}

async function getHermesCliConfigOverview(): Promise<HermesCliConfigResponse> {
  const hermesHome = getHermesHome();
  const [configPath, envPath, version, status, config] = await Promise.all([
    runHermesCli(['config', 'path'], 8000),
    runHermesCli(['config', 'env-path'], 8000),
    runHermesCli(['--version'], 8000),
    runHermesCli(['status'], 15000),
    runHermesCli(['config', 'show'], 15000),
  ]);
  const configPathLines = configPath.stdout.trim().split('\n');
  const envPathLines = envPath.stdout.trim().split('\n');
  return {
    hermesHome,
    cliPath: getHermesCliPath(),
    configPath: configPathLines[configPathLines.length - 1] || path.join(hermesHome, 'config.yaml'),
    envPath: envPathLines[envPathLines.length - 1] || path.join(hermesHome, '.env'),
    commands: HERMES_CLI_COMMANDS,
    overview: { version, status, config },
  };
}

type HermesSessionSummary = {
  id: string;
  title?: string;
  model?: string;
  platform?: string;
  session_start?: string;
  last_updated?: string;
  path?: string;
};

type HermesCronJobSummary = {
  id: string;
  name: string;
  enabled: boolean;
  state?: string;
  schedule_display?: string;
  schedule_kind?: string;
  schedule_expr?: string;
  repeat_completed?: number;
  repeat_times?: number | null;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  last_error?: string;
  last_delivery_error?: string;
  deliver?: string;
  script?: string;
  no_agent?: boolean;
  workdir?: string;
  model?: string;
  provider?: string;
  skills?: string[];
};

type HermesCronJobsResponse = {
  jobs: HermesCronJobSummary[];
  total: number;
  active: number;
  paused: number;
  errors: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length ? strings : undefined;
}

function firstUserMessagePreview(json: Record<string, unknown>): string | undefined {
  const messages = Array.isArray(json.messages) ? json.messages : [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const item = message as Record<string, unknown>;
    if (item.role !== 'user') continue;
    const content = item.content;
    if (typeof content === 'string') return content.trim().slice(0, 120);
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string' && part.trim()) return part.trim().slice(0, 120);
        if (part && typeof part === 'object') {
          const text = firstString((part as Record<string, unknown>).text, (part as Record<string, unknown>).content);
          if (text) return text.slice(0, 120);
        }
      }
    }
  }
  return undefined;
}

async function readHermesSessionFile(filePath: string): Promise<(HermesSessionSummary & { sortTime: number }) | null> {
  try {
    const [raw, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const json = parsed as Record<string, unknown>;
    const stem = path.basename(filePath, path.extname(filePath));
    const id = firstString(json.session_id, json.id) ?? stem;
    const title = firstString(json.title, json.name, firstUserMessagePreview(json)) ?? stem;
    const lastUpdated = firstString(json.last_updated, json.updated_at, json.updatedAt);
    const sessionStart = firstString(json.session_start, json.started_at, json.created_at, json.createdAt);
    const sortTime = lastUpdated ? Date.parse(lastUpdated) || stat.mtimeMs : stat.mtimeMs;
    return {
      id,
      title,
      model: firstString(json.model, json.model_id, json.modelId),
      platform: firstString(json.platform, json.provider, json.agent),
      session_start: sessionStart,
      last_updated: lastUpdated,
      path: filePath,
      sortTime,
    };
  } catch {
    return null;
  }
}

async function listHermesSessions(limit: number): Promise<HermesSessionSummary[]> {
  const hermesHome = getHermesHome();
  const sessionsDir = path.join(hermesHome, 'sessions');
  let entries: string[];
  try {
    entries = await fs.readdir(sessionsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const sessionFiles = entries.filter((entry) => path.extname(entry).toLowerCase() === '.json');
  const sessions = await Promise.all(sessionFiles.map((entry) => readHermesSessionFile(path.join(sessionsDir, entry))));
  return sessions
    .filter((session): session is HermesSessionSummary & { sortTime: number } => session !== null)
    .toSorted((a, b) => b.sortTime - a.sortTime)
    .slice(0, limit)
    .map(({ sortTime: _sortTime, ...session }) => session);
}

function normalizeHermesCronJob(raw: unknown): (HermesCronJobSummary & { sortTime: number }) | null {
  if (!isRecord(raw)) return null;
  const id = firstString(raw.id);
  if (!id) return null;
  const schedule = isRecord(raw.schedule) ? raw.schedule : {};
  const repeat = isRecord(raw.repeat) ? raw.repeat : {};
  const nextRunAt = firstString(raw.next_run_at);
  const lastRunAt = firstString(raw.last_run_at);
  const sortTime = nextRunAt ? Date.parse(nextRunAt) || Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  const repeatTimes = optionalNumber(repeat.times) ?? (repeat.times === null ? null : undefined);

  return {
    id,
    name: firstString(raw.name) ?? id,
    enabled: optionalBoolean(raw.enabled) ?? raw.state !== 'paused',
    state: firstString(raw.state),
    schedule_display: firstString(raw.schedule_display, schedule.display),
    schedule_kind: firstString(schedule.kind),
    schedule_expr: firstString(schedule.expr),
    repeat_completed: optionalNumber(repeat.completed),
    repeat_times: repeatTimes,
    next_run_at: nextRunAt,
    last_run_at: lastRunAt,
    last_status: firstString(raw.last_status),
    last_error: firstString(raw.last_error),
    last_delivery_error: firstString(raw.last_delivery_error),
    deliver: firstString(raw.deliver),
    script: firstString(raw.script),
    no_agent: optionalBoolean(raw.no_agent),
    workdir: firstString(raw.workdir),
    model: firstString(raw.model),
    provider: firstString(raw.provider),
    skills: optionalStringArray(raw.skills),
    sortTime,
  };
}

async function listHermesCronJobs(limit: number): Promise<HermesCronJobsResponse> {
  const jobsPath = path.join(getHermesHome(), 'cron', 'jobs.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(jobsPath, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { jobs: [], total: 0, active: 0, paused: 0, errors: 0 };
    }
    throw error;
  }

  const rawJobs = isRecord(parsed) && Array.isArray(parsed.jobs) ? parsed.jobs : [];
  const jobs = rawJobs
    .map(normalizeHermesCronJob)
    .filter((job): job is HermesCronJobSummary & { sortTime: number } => job !== null);
  const active = jobs.filter((job) => job.enabled).length;
  const paused = jobs.filter((job) => !job.enabled || job.state === 'paused').length;
  const errors = jobs.filter(
    (job) => job.last_status === 'error' || !!job.last_error || !!job.last_delivery_error
  ).length;

  return {
    jobs: jobs
      .toSorted((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.sortTime - b.sortTime;
      })
      .slice(0, limit)
      .map(({ sortTime: _sortTime, ...job }) => job),
    total: jobs.length,
    active,
    paused,
    errors,
  };
}

async function handleHermesCliConfigRoute(
  req: IncomingMessage,
  res: ServerResponse,
  backendPort: number
): Promise<boolean> {
  const url = new URL(req.url ?? '', 'http://127.0.0.1');
  if (url.pathname !== '/api/agents/hermes/cli-config') return false;

  if (!(await isAuthenticated(req, backendPort))) {
    sendJson(res, 401, { success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
    return true;
  }

  if (req.method === 'GET') {
    sendJson(res, 200, { success: true, data: await getHermesCliConfigOverview() });
    return true;
  }

  if (req.method === 'POST') {
    const body = (await readJsonBody(req)) as { command_id?: unknown } | undefined;
    const commandId = typeof body?.command_id === 'string' ? body.command_id : '';
    const command = HERMES_CLI_COMMANDS_BY_ID.get(commandId);
    if (!command) {
      sendJson(res, 400, { success: false, error: 'Unknown or disallowed Hermes CLI command', code: 'BAD_COMMAND' });
      return true;
    }
    const result = await runHermesCli(command.args, 20000);
    sendJson(res, 200, { success: true, data: { command, result } });
    return true;
  }

  sendJson(res, 405, { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  return true;
}

async function handleHermesMemoryRoute(
  req: IncomingMessage,
  res: ServerResponse,
  backendPort: number
): Promise<boolean> {
  if (req.url !== '/api/agents/hermes/memory') return false;

  if (!(await isAuthenticated(req, backendPort))) {
    sendJson(res, 401, { success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
    return true;
  }

  const hermesHome = getHermesHome();
  const { memoryPath, userPath, legacyMemoryPath, legacyUserPath } = getHermesMemoryPaths(hermesHome);

  if (req.method === 'GET') {
    const [memoryResult, userResult] = await Promise.all([
      readFirstExistingTextFileOrEmpty([memoryPath, legacyMemoryPath]),
      readFirstExistingTextFileOrEmpty([userPath, legacyUserPath]),
    ]);
    sendJson(res, 200, {
      success: true,
      data: {
        memory: memoryResult.content,
        user: userResult.content,
        memory_mtime: memoryResult.mtime,
        user_mtime: userResult.mtime,
      },
    });
    return true;
  }

  if (req.method === 'PUT') {
    const body = (await readJsonBody(req)) as { memory?: unknown; user?: unknown } | undefined;
    const hasMemory = body && typeof body.memory === 'string';
    const hasUser = body && typeof body.user === 'string';
    if (!body || (!hasMemory && !hasUser)) {
      sendJson(res, 400, {
        success: false,
        error: 'Expected at least one of { memory: string, user: string }',
        code: 'BAD_REQUEST',
      });
      return true;
    }
    await fs.mkdir(path.dirname(memoryPath), { recursive: true });
    const writes: Promise<void>[] = [];
    if (hasMemory) writes.push(fs.writeFile(memoryPath, body.memory as string));
    if (hasUser) writes.push(fs.writeFile(userPath, body.user as string));
    await Promise.all(writes);
    sendJson(res, 200, { success: true, data: undefined });
    return true;
  }

  sendJson(res, 405, { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  return true;
}

async function handleHermesSessionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  backendPort: number
): Promise<boolean> {
  const url = new URL(req.url ?? '', 'http://127.0.0.1');
  if (url.pathname !== '/api/agents/hermes/sessions') return false;

  if (!(await isAuthenticated(req, backendPort))) {
    sendJson(res, 401, { success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
    return true;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
    return true;
  }

  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 20;
  const sessions = await listHermesSessions(limit);
  sendJson(res, 200, { success: true, data: { sessions } });
  return true;
}

async function handleHermesCronJobsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  backendPort: number
): Promise<boolean> {
  const url = new URL(req.url ?? '', 'http://127.0.0.1');
  if (url.pathname !== '/api/agents/hermes/cron/jobs') return false;

  if (!(await isAuthenticated(req, backendPort))) {
    sendJson(res, 401, { success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
    return true;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
    return true;
  }

  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100;
  const data = await listHermesCronJobs(limit);
  sendJson(res, 200, { success: true, data });
  return true;
}

// Max bytes we peek before forcing a routing decision. An HTTP request-line
// on its own is typically < 100 bytes; a full header block is < 2 KB. If we
// haven't seen a newline after 4 KB the client is sending something weird —
// hand it to the internal HTTP server and let it return 400.
const PEEK_LIMIT_BYTES = 4096;

/**
 * Splice `client` to a TCP endpoint on `targetPort`. Any bytes already read
 * from `client` during peek are replayed to the upstream as the first write,
 * so the endpoint sees the full HTTP request as-sent.
 */
function spliceToTcpEndpoint(client: Socket, targetPort: number, initialBytes: Buffer): void {
  client.setNoDelay(true);
  client.setKeepAlive(true);
  client.setTimeout(0);
  const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
  upstream.setNoDelay(true);
  upstream.setKeepAlive(true);
  upstream.once('connect', () => {
    if (initialBytes.length > 0) upstream.write(initialBytes);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  const tearDown = (): void => {
    client.destroy();
    upstream.destroy();
  };
  upstream.on('error', tearDown);
  client.on('error', tearDown);
  upstream.on('close', tearDown);
  client.on('close', tearDown);
}

/**
 * Decide routing from the first chunk of an incoming HTTP connection:
 *  - `true`  → `GET /ws[...] HTTP/1.x` (WebSocket upgrade), splice to backend
 *  - `false` → any other HTTP method / path, hand to internal HTTP server
 *  - `null`  → need more bytes (no CRLF yet)
 *
 * We only check the request-line; `Upgrade: websocket` is not strictly
 * required — the backend will reject a non-upgrade `GET /ws` on its own.
 * Keeping the rule simple means we can decide after the first ~50 bytes
 * instead of waiting for the full header block.
 */
function peekWsRoute(buf: Buffer): boolean | null {
  const newlineIdx = buf.indexOf(0x0a); // \n
  if (newlineIdx < 0) return null;
  const firstLine = buf.slice(0, newlineIdx).toString('ascii');
  return /^GET\s+\/ws(?:\?[^\s]*)?\s+HTTP\/1\.[01]\r?$/.test(firstLine);
}

export async function startStaticServer(opts: StaticServerOptions): Promise<StaticServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const allowRemote = opts.allowRemote === true;
  const host = allowRemote ? '0.0.0.0' : '127.0.0.1';

  // The HTTP server listens only on loopback — user traffic hits the outer
  // net.Server first. We route to this server for everything except WS
  // upgrades, which go straight to the backend via a raw TCP splice.
  //
  // Why two listeners instead of using `http.Server`'s native `upgrade` event:
  // bun 1.3's http-compat layer does not faithfully forward writes on the
  // socket delivered to the `upgrade` handler, so the backend's 101 response
  // never reaches the browser (see #2824). Making the outer listener pure
  // TCP avoids touching that code path on both bun and node.
  const http_server: Server = http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        res.writeHead(400).end();
        return;
      }

      if (await handleHermesCliConfigRoute(req, res, opts.backendPort)) {
        return;
      }
      if (await handleHermesMemoryRoute(req, res, opts.backendPort)) {
        return;
      }
      if (await handleHermesSessionsRoute(req, res, opts.backendPort)) {
        return;
      }
      if (await handleHermesCronJobsRoute(req, res, opts.backendPort)) {
        return;
      }

      // /api/* — reverse proxy to backend (includes /api/auth/*).
      // /login and /logout are aionui-auth's top-level auth endpoints: proxy them too
      // so WebUI browser clients reach the backend without a path-rewrite.
      if (req.url.startsWith('/api/') || req.url.startsWith('/api?') || req.url === '/login' || req.url === '/logout') {
        forwardToBackend(req, res, opts.backendPort);
        return;
      }

      // static files + SPA fallback
      await serveHandler(req, res, {
        public: opts.staticDir,
        rewrites: [{ source: '**', destination: '/index.html' }],
      });
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
      } else {
        res.destroy();
      }
    }
  });

  // Internal HTTP server — 127.0.0.1 ephemeral port, never visible to the user.
  await new Promise<void>((resolve, reject) => {
    http_server.once('error', reject);
    http_server.listen(0, '127.0.0.1', () => {
      http_server.off('error', reject);
      resolve();
    });
  });
  const internalPort = (http_server.address() as { port: number } | null)?.port;
  if (!internalPort) {
    throw new Error('internal HTTP server failed to bind to a port');
  }

  // User-facing listener: inspect the first line of every TCP connection and
  // route to either the backend (for /ws upgrades) or the internal HTTP
  // server (everything else). Both routes use raw TCP splice — no reliance
  // on http.Server's upgrade event.
  const activeSockets = new Set<Socket>();
  const tcp_server = net.createServer((client: Socket) => {
    activeSockets.add(client);
    client.on('close', () => activeSockets.delete(client));
    let peeked = Buffer.alloc(0);
    let settled = false;
    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      client.removeListener('data', onData);
      client.removeListener('error', onEarlyError);
      client.removeListener('end', onEarlyEnd);
    };
    const onData = (chunk: Buffer): void => {
      peeked = Buffer.concat([peeked, chunk]);
      const decision = peekWsRoute(peeked);
      if (decision === null && peeked.length < PEEK_LIMIT_BYTES) return;
      cleanup();
      const target = decision === true ? opts.backendPort : internalPort;
      spliceToTcpEndpoint(client, target, peeked);
    };
    const onEarlyError = (): void => {
      cleanup();
      client.destroy();
    };
    const onEarlyEnd = (): void => {
      // Client closed before we saw a request line — nothing to route.
      cleanup();
      client.destroy();
    };
    client.on('data', onData);
    client.on('error', onEarlyError);
    client.on('end', onEarlyEnd);
  });

  await new Promise<void>((resolve, reject) => {
    tcp_server.once('error', reject);
    tcp_server.listen(port, host, () => {
      tcp_server.off('error', reject);
      resolve();
    });
  });

  const actualPort = (tcp_server.address() as { port: number } | null)?.port ?? port;
  const lanIP = allowRemote ? (getLanIP() ?? undefined) : undefined;
  const localUrl = `http://127.0.0.1:${actualPort}`;
  const networkUrl = lanIP ? `http://${lanIP}:${actualPort}` : undefined;

  return {
    port: actualPort,
    url: networkUrl ?? localUrl,
    localUrl,
    networkUrl,
    lanIP,
    stop: () =>
      new Promise<void>((resolve) => {
        activeSockets.forEach((socket) => socket.destroy());
        http_server.closeAllConnections?.();
        tcp_server.close(() => {
          http_server.close(() => resolve());
        });
      }),
  };
}

export async function stopStaticServer(handle: StaticServerHandle): Promise<void> {
  await handle.stop();
}

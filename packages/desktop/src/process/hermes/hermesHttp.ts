/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared helpers for the Hermes WebUI API bridge handlers. Node-only; no
 * AionUi runtime imports so each handler module loads under tsx without
 * path-alias resolution.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Shared config passed to every Hermes endpoint handler. */
export type HermesCtx = {
  /** Absolute HERMES_HOME path (e.g. /root/.hermes). */
  hermesHome: string;
  /** hermes CLI binary (resolved path or 'hermes'). */
  hermesBin: string;
  /** Per-CLI-command timeout in ms. */
  cliTimeoutMs: number;
};

export function sendJson(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
  return true;
}

export function sendError(res: ServerResponse, status: number, message: string): true {
  return sendJson(res, status, { error: message });
}

export function sendNoContent(res: ServerResponse): true {
  res.writeHead(204);
  res.end();
  return true;
}

export async function readJsonBody<T>(req: IncomingMessage, limitBytes = 2 * 1024 * 1024): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export async function readFileOrEmpty(file: string): Promise<{ content: string; mtime?: string }> {
  try {
    const [content, stat] = await Promise.all([fs.readFile(file, 'utf-8'), fs.stat(file)]);
    return { content, mtime: stat.mtime.toISOString() };
  } catch {
    return { content: '' };
  }
}

export type CliRunResult = {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

/**
 * Run the `hermes` CLI with fixed argv (NEVER a shell string — args are passed
 * as an array to execFile so user-supplied values can't inject shell syntax).
 * Resolves (never rejects) with the captured result, including non-zero exits.
 */
export function runHermesCli(hermesBin: string, args: string[], timeoutMs = 20000): Promise<CliRunResult> {
  return new Promise<CliRunResult>((resolve) => {
    execFile(
      hermesBin,
      args,
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const timedOut = Boolean(error && (error as { killed?: boolean }).killed);
        const exitCode =
          error && typeof (error as { code?: number }).code === 'number'
            ? (error as { code: number }).code
            : error
              ? null
              : 0;
        resolve({
          command: hermesBin,
          args,
          exitCode,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          timedOut,
        });
      }
    );
  });
}

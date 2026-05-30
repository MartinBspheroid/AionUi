/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Memory endpoint — read/write MEMORY.md and USER.md under HERMES_HOME/memories. */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HermesMemoryPayload, HermesMemoryUpdate } from '@/common/types/hermes/hermesExt';
import { readFileOrEmpty, readJsonBody, sendError, sendJson, sendNoContent } from './hermesHttp';

export function memoryPaths(hermesHome: string): { memory: string; user: string } {
  const dir = path.join(hermesHome, 'memories');
  return { memory: path.join(dir, 'MEMORY.md'), user: path.join(dir, 'USER.md') };
}

export async function handleMemory(
  hermesHome: string,
  req: IncomingMessage,
  res: ServerResponse,
  method: string
): Promise<boolean> {
  const paths = memoryPaths(hermesHome);

  if (method === 'GET') {
    const [mem, usr] = await Promise.all([readFileOrEmpty(paths.memory), readFileOrEmpty(paths.user)]);
    const payload: HermesMemoryPayload = {
      memory: mem.content,
      user: usr.content,
      memory_mtime: mem.mtime,
      user_mtime: usr.mtime,
    };
    return sendJson(res, 200, payload);
  }

  if (method === 'PUT') {
    let update: HermesMemoryUpdate;
    try {
      update = await readJsonBody<HermesMemoryUpdate>(req);
    } catch (err) {
      return sendError(res, 400, err instanceof Error ? err.message : 'bad request');
    }
    await fs.mkdir(path.dirname(paths.memory), { recursive: true });
    if (typeof update.memory === 'string') await fs.writeFile(paths.memory, update.memory, 'utf-8');
    if (typeof update.user === 'string') await fs.writeFile(paths.user, update.user, 'utf-8');
    return sendNoContent(res);
  }

  return sendError(res, 405, 'method not allowed');
}

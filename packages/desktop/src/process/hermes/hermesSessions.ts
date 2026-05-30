/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Handler for GET /api/agents/hermes/sessions. Reads persisted session JSON
 * files from ${hermesHome}/sessions and returns lightweight summaries.
 * Node-only; no AionUi runtime imports so it loads under tsx.
 */

import { promises as fs } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { sendJson } from './hermesHttp';
import type { HermesSessionSummary, HermesSessionsResponse } from '@/common/types/hermes/hermesExt';

const MAX_SESSIONS = 50;
const TITLE_MAX_LEN = 80;

type RawMessage = {
  role?: unknown;
  content?: unknown;
};

type RawSession = {
  session_id?: unknown;
  model?: unknown;
  platform?: unknown;
  session_start?: unknown;
  last_updated?: unknown;
  messages?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Extract plain text from a message's `content` (string or array of parts). */
function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (typeof part === 'string') {
        parts.push(part);
      } else if (part && typeof part === 'object') {
        const text = (part as { text?: unknown }).text;
        if (typeof text === 'string') parts.push(text);
      }
    }
    return parts.join(' ');
  }
  return '';
}

/** Derive a short title from the first user message, falling back to the id. */
function deriveTitle(messages: unknown, fallback: string): string {
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (!msg || typeof msg !== 'object') continue;
      const { role, content } = msg as RawMessage;
      if (role !== 'user') continue;
      const text = contentToText(content).trim();
      if (text) {
        return text.length > TITLE_MAX_LEN ? `${text.slice(0, TITLE_MAX_LEN).trimEnd()}…` : text;
      }
    }
  }
  return fallback;
}

function isSessionFile(name: string): boolean {
  if (!name.endsWith('.json')) return false;
  if (name.endsWith('.jsonl')) return false;
  if (name.startsWith('request_dump_')) return false;
  return true;
}

function parseSession(raw: string, filePath: string): HermesSessionSummary | undefined {
  let data: RawSession;
  try {
    data = JSON.parse(raw) as RawSession;
  } catch {
    return undefined;
  }
  if (!data || typeof data !== 'object') return undefined;
  const id = asString(data.session_id);
  if (!id) return undefined;
  const sessionStart = asString(data.session_start);
  const lastUpdated = asString(data.last_updated);
  return {
    id,
    title: deriveTitle(data.messages, id),
    model: asString(data.model),
    platform: asString(data.platform),
    session_start: sessionStart,
    last_updated: lastUpdated,
    path: filePath,
  };
}

function sortKey(s: HermesSessionSummary): string {
  return s.last_updated ?? s.session_start ?? '';
}

export async function handleSessions(hermesHome: string, res: ServerResponse): Promise<boolean> {
  const dir = path.join(hermesHome, 'sessions');

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return sendJson(res, 200, { sessions: [] } satisfies HermesSessionsResponse);
  }

  const files = entries.filter(isSessionFile);
  const parsed = await Promise.all(
    files.map(async (name): Promise<HermesSessionSummary | undefined> => {
      const filePath = path.join(dir, name);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        return parseSession(raw, filePath);
      } catch {
        return undefined;
      }
    })
  );

  const sessions = parsed
    .filter((s): s is HermesSessionSummary => s !== undefined)
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .slice(0, MAX_SESSIONS);

  return sendJson(res, 200, { sessions } satisfies HermesSessionsResponse);
}

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpConversation } from '@/common/adapter/ipcBridge';
import type { BackendHttpError } from '@/common/adapter/httpBridge';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

describe('Hermes ACP extension bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ data: undefined }),
    });
  });

  it('loads Hermes memory from the documented backend route', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        data: {
          memory: 'memory',
          user: 'user',
          memory_mtime: '2026-05-28T12:00:00.000Z',
          user_mtime: '2026-05-28T11:00:00.000Z',
        },
      }),
    });

    await expect(acpConversation.hermesExt.getMemory.invoke()).resolves.toEqual({
      memory: 'memory',
      user: 'user',
      memory_mtime: '2026-05-28T12:00:00.000Z',
      user_mtime: '2026-05-28T11:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:13400/api/agents/hermes/memory',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('sends partial memory updates for a single section', async () => {
    await acpConversation.hermesExt.setMemory.invoke({ user: 'just the user side' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:13400/api/agents/hermes/memory',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ user: 'just the user side' }) })
    );
  });

  it('lists Hermes sessions from the documented backend route', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ data: { sessions: [{ id: 'session-1', title: 'Build parity' }] } }),
    });

    await expect(acpConversation.hermesExt.listSessions.invoke()).resolves.toEqual({
      sessions: [{ id: 'session-1', title: 'Build parity' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:13400/api/agents/hermes/sessions?limit=20',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('lists Hermes skills from the documented backend route', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        data: {
          skills: [{ id: 'creative/p5js', name: 'p5js', category: 'creative', description: '', tags: [] }],
          categories: ['creative'],
        },
      }),
    });

    const result = await acpConversation.hermesExt.listSkills.invoke();
    expect(result.categories).toEqual(['creative']);
    expect(result.skills).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:13400/api/agents/hermes/skills',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('creates Hermes cron jobs via POST to the documented endpoint', async () => {
    await acpConversation.hermesExt.createCronJob.invoke({
      schedule: '30m',
      prompt: 'Build the digest',
      skills: ['dogfood'],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:13400/api/agents/hermes/cron/jobs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ schedule: '30m', prompt: 'Build the digest', skills: ['dogfood'] }),
      })
    );
  });

  it('routes cron actions (run/pause/resume/delete/update) to id-scoped endpoints', async () => {
    await acpConversation.hermesExt.runCronJob.invoke({ id: 'abc123' });
    await acpConversation.hermesExt.pauseCronJob.invoke({ id: 'abc123' });
    await acpConversation.hermesExt.resumeCronJob.invoke({ id: 'abc123' });
    await acpConversation.hermesExt.deleteCronJob.invoke({ id: 'abc123' });
    await acpConversation.hermesExt.updateCronJob.invoke({ id: 'abc123', patch: { name: 'renamed' } });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:13400/api/agents/hermes/cron/jobs/abc123/run',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:13400/api/agents/hermes/cron/jobs/abc123/pause',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:13400/api/agents/hermes/cron/jobs/abc123/resume',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:13400/api/agents/hermes/cron/jobs/abc123',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://127.0.0.1:13400/api/agents/hermes/cron/jobs/abc123',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'renamed' }) })
    );
  });

  it('encodes skill ids with embedded slashes when fetching a single skill', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        data: {
          id: 'autonomous-ai-agents/claude code',
          name: 'claude code',
          category: 'autonomous-ai-agents',
          description: '',
          tags: [],
          content: '# Claude',
          files: [],
        },
      }),
    });

    await acpConversation.hermesExt.getSkill.invoke({ id: 'autonomous-ai-agents/claude code' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:13400/api/agents/hermes/skills?id=autonomous-ai-agents%2Fclaude%20code',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('maps header action bridge calls to Hermes conversation endpoints', async () => {
    await acpConversation.hermesExt.compress.invoke({ conversation_id: 'conv-1', focus: 'tools' });
    await acpConversation.hermesExt.retry.invoke({ conversation_id: 'conv-1' });
    await acpConversation.hermesExt.undo.invoke({ conversation_id: 'conv-1' });
    await acpConversation.hermesExt.forkSession.invoke({ conversation_id: 'conv-1' });
    await acpConversation.hermesExt.listCheckpoints.invoke({ conversation_id: 'conv-1' });
    await acpConversation.hermesExt.restoreCheckpoint.invoke({ conversation_id: 'conv-1', checkpoint_id: 'ckpt 1' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:13400/api/conversations/conv-1/hermes/compress',
      expect.objectContaining({ body: JSON.stringify({ focus: 'tools' }), method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:13400/api/conversations/conv-1/hermes/retry',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:13400/api/conversations/conv-1/hermes/undo',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:13400/api/conversations/conv-1/hermes/fork',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://127.0.0.1:13400/api/conversations/conv-1/hermes/checkpoints',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://127.0.0.1:13400/api/conversations/conv-1/hermes/checkpoints/ckpt%201/restore',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('surfaces 404 as an unsupported backend endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ error: 'not found', code: 'NOT_FOUND' }),
    });

    await expect(acpConversation.hermesExt.getCapabilities.invoke({ conversation_id: 'conv-1' })).rejects.toMatchObject(
      {
        status: 404,
      } satisfies Partial<BackendHttpError>
    );
  });
});

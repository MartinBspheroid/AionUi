/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { useAcpMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';

const { addOrUpdateMessageMock, responseStreamOnMock, responseStreamHandlerRef } = vi.hoisted(() => ({
  addOrUpdateMessageMock: vi.fn(),
  responseStreamOnMock: vi.fn(),
  responseStreamHandlerRef: {
    current: undefined as ((message: IResponseMessage) => void) | undefined,
  },
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => addOrUpdateMessageMock,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      responseStream: {
        on: responseStreamOnMock.mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlerRef.current = handler;
          return vi.fn();
        }),
      },
    },
    conversation: {
      warmup: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
      getSlashCommands: {
        invoke: vi.fn().mockResolvedValue([]),
      },
    },
  },
}));

describe('useAcpMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responseStreamHandlerRef.current = undefined;
  });

  it('completes hydration when the conversation lookup fails', async () => {
    vi.mocked(getConversationOrNull).mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useAcpMessage('conv-1'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    expect(result.current.running).toBe(false);
    expect(result.current.aiProcessing).toBe(false);
  });

  it('emits a synthetic thinking done update on finish when the stream never sends one', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);

    const now = Date.now();
    renderHook(() => useAcpMessage('conv-1'));

    expect(responseStreamHandlerRef.current).toBeTypeOf('function');

    responseStreamHandlerRef.current?.({
      type: 'request_trace',
      data: {
        timestamp: now - 4200,
        backend: 'claude',
        model_id: 'model-1',
      },
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
    });

    responseStreamHandlerRef.current?.({
      type: 'thinking',
      data: {
        content: 'alpha',
        status: 'thinking',
      },
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
    });

    responseStreamHandlerRef.current?.({
      type: 'finish',
      data: null,
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
    });

    expect(addOrUpdateMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'thinking',
        msg_id: 'msg-1',
        conversation_id: 'conv-1',
        content: expect.objectContaining({
          status: 'done',
          duration: expect.any(Number),
        }),
      })
    );
  });

  it('completes thinking as soon as the first non-thinking message arrives', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);

    renderHook(() => useAcpMessage('conv-1'));

    responseStreamHandlerRef.current?.({
      type: 'thinking',
      data: {
        content: 'alpha',
        status: 'thinking',
      },
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
      created_at: 1_000,
    });

    responseStreamHandlerRef.current?.({
      type: 'text',
      data: 'beta',
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
      created_at: 4_200,
    });

    expect(addOrUpdateMessageMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'thinking',
        msg_id: 'msg-1',
        content: expect.objectContaining({
          status: 'thinking',
        }),
      })
    );
    expect(addOrUpdateMessageMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'thinking',
        msg_id: 'msg-1',
        content: expect.objectContaining({
          status: 'done',
          duration: 3200,
        }),
      })
    );
    expect(addOrUpdateMessageMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: 'text',
        msg_id: 'msg-1',
      })
    );
  });

  it('maps Hermes ACP command input hints from fetched slash commands', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);
    vi.mocked(ipcBridge.conversation.getSlashCommands.invoke).mockResolvedValue([
      {
        command: 'cron',
        description: 'Manage scheduled jobs: list, status, create',
        input_hint: 'list | status | create <cron> :: <prompt>',
      },
    ] as Awaited<ReturnType<typeof ipcBridge.conversation.getSlashCommands.invoke>>);

    const { result } = renderHook(() => useAcpMessage('conv-1'));

    await waitFor(() => {
      expect(result.current.slashCommands).toEqual([
        expect.objectContaining({
          name: 'cron',
          description: 'Manage scheduled jobs: list, status, create',
          hint: 'list | status | create <cron> :: <prompt>',
          kind: 'template',
          source: 'acp',
          selectionBehavior: 'insert',
        }),
      ]);
    });
  });

  it('maps Hermes ACP command input hints from stream updates', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);

    const { result } = renderHook(() => useAcpMessage('conv-1'));

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'available_commands',
        data: {
          commands: [
            {
              name: 'memory',
              description: 'Read or update persistent memory',
              input_hint: 'read [memory|user] | add [memory|user] <text>',
            },
          ],
        },
        msg_id: 'msg-1',
        conversation_id: 'conv-1',
      } as IResponseMessage);
    });

    expect(result.current.slashCommands).toEqual([
      expect.objectContaining({
        name: 'memory',
        description: 'Read or update persistent memory',
        hint: 'read [memory|user] | add [memory|user] <text>',
        kind: 'template',
        source: 'acp',
        selectionBehavior: 'insert',
      }),
    ]);
  });
});

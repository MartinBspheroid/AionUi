/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      hermesExt: {
        getMemory: { invoke: vi.fn() },
        setMemory: { invoke: vi.fn() },
      },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  isBackendHttpError: (err: unknown): err is { status: number; backendMessage?: string } => {
    return (
      err !== null &&
      typeof err === 'object' &&
      'status' in err &&
      typeof (err as { status: unknown }).status === 'number'
    );
  },
}));

import { ipcBridge } from '@/common';
import { useHermesMemory } from '@/renderer/pages/settings/HermesSettings/useHermesMemory';

const getMemoryInvoke = () => vi.mocked(ipcBridge.acpConversation.hermesExt.getMemory.invoke);
const setMemoryInvoke = () => vi.mocked(ipcBridge.acpConversation.hermesExt.setMemory.invoke);

const makePayload = (user = 'user-content', memory = 'memory-content') => ({
  user,
  user_mtime: '2025-01-01T00:00:00Z',
  memory,
  memory_mtime: '2025-01-02T00:00:00Z',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useHermesMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loading=true before getMemory resolves', async () => {
    const d = deferred<ReturnType<typeof makePayload>>();
    getMemoryInvoke().mockReturnValue(d.promise);

    const { result } = renderHook(() => useHermesMemory());

    expect(result.current.loading).toBe(true);

    await act(async () => {
      d.resolve(makePayload());
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('user.draft and memory.draft set from resolved payload', async () => {
    getMemoryInvoke().mockResolvedValue(makePayload('hello user', 'hello memory'));

    const { result } = renderHook(() => useHermesMemory());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user.draft).toBe('hello user');
    expect(result.current.memory.draft).toBe('hello memory');
  });

  it('unsupported=true when getMemory rejects with status 404', async () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 });
    getMemoryInvoke().mockRejectedValue(err);

    const { result } = renderHook(() => useHermesMemory());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unsupported).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('error string set for non-404 rejection', async () => {
    const err = new Error('Internal Server Error');
    getMemoryInvoke().mockRejectedValue(err);

    const { result } = renderHook(() => useHermesMemory());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unsupported).toBe(false);
    expect(typeof result.current.error).toBe('string');
    expect(result.current.error).toBeTruthy();
  });

  it('user.isDirty false initially, true after user.setDraft', async () => {
    getMemoryInvoke().mockResolvedValue(makePayload('original', 'mem'));

    const { result } = renderHook(() => useHermesMemory());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user.isDirty).toBe(false);

    act(() => {
      result.current.user.setDraft('modified');
    });

    expect(result.current.user.isDirty).toBe(true);
  });

  it('user.save() calls setMemory.invoke({ user: draft }) then getMemory again', async () => {
    const payload = makePayload('original', 'mem');
    getMemoryInvoke().mockResolvedValue(payload);
    setMemoryInvoke().mockResolvedValue(undefined);

    const { result } = renderHook(() => useHermesMemory());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.user.setDraft('updated user');
    });

    // getMemory was called once during mount; reset count before save
    getMemoryInvoke().mockClear();
    getMemoryInvoke().mockResolvedValue(makePayload('updated user', 'mem'));

    await act(async () => {
      await result.current.user.save();
    });

    expect(setMemoryInvoke()).toHaveBeenCalledWith({ user: 'updated user' });
    expect(getMemoryInvoke()).toHaveBeenCalledTimes(1);
  });

  it('memory.save() calls setMemory.invoke({ memory: draft }) then getMemory', async () => {
    const payload = makePayload('user', 'original memory');
    getMemoryInvoke().mockResolvedValue(payload);
    setMemoryInvoke().mockResolvedValue(undefined);

    const { result } = renderHook(() => useHermesMemory());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.memory.setDraft('updated memory');
    });

    getMemoryInvoke().mockClear();
    getMemoryInvoke().mockResolvedValue(makePayload('user', 'updated memory'));

    await act(async () => {
      await result.current.memory.save();
    });

    expect(setMemoryInvoke()).toHaveBeenCalledWith({ memory: 'updated memory' });
    expect(getMemoryInvoke()).toHaveBeenCalledTimes(1);
  });

  it('reload() calls getMemory again', async () => {
    getMemoryInvoke().mockResolvedValue(makePayload());

    const { result } = renderHook(() => useHermesMemory());

    await waitFor(() => expect(result.current.loading).toBe(false));

    getMemoryInvoke().mockClear();
    getMemoryInvoke().mockResolvedValue(makePayload('new user', 'new memory'));

    await act(async () => {
      await result.current.reload();
    });

    expect(getMemoryInvoke()).toHaveBeenCalledTimes(1);
    expect(result.current.user.draft).toBe('new user');
    expect(result.current.memory.draft).toBe('new memory');
  });
});

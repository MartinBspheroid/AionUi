/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      hermesExt: {
        getCapabilities: { invoke: vi.fn() },
      },
    },
  },
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import { useHermesCapabilities } from '@/renderer/hooks/hermes/useHermesCapabilities';
import { ipcBridge } from '@/common';

function getCapsInvoke() {
  return (ipcBridge.acpConversation.hermesExt.getCapabilities as unknown as { invoke: ReturnType<typeof vi.fn> })
    .invoke;
}

describe('useHermesCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts loading and then resolves capabilities', async () => {
    const caps = { compress: true, retry: true };
    getCapsInvoke().mockResolvedValue(caps);
    const { result } = renderHook(() => useHermesCapabilities('conv-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.capabilities).toEqual(caps);
    expect(result.current.unsupported).toBe(false);
  });

  it('sets unsupported=true on 404', async () => {
    getCapsInvoke().mockRejectedValue({ status: 404 });
    const { result } = renderHook(() => useHermesCapabilities('conv-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unsupported).toBe(true);
    expect(result.current.capabilities).toBeNull();
  });

  it('sets capabilities=null on non-404 error', async () => {
    getCapsInvoke().mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useHermesCapabilities('conv-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.capabilities).toBeNull();
    expect(result.current.unsupported).toBe(false);
  });

  it('does not fetch when enabled=false', async () => {
    const { result } = renderHook(() => useHermesCapabilities('conv-1', { enabled: false }));
    // Give it a tick to not-fetch
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(getCapsInvoke()).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('does not fetch when conversation_id is undefined', async () => {
    renderHook(() => useHermesCapabilities(undefined));
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(getCapsInvoke()).not.toHaveBeenCalled();
  });

  it('refresh() triggers a new fetch', async () => {
    getCapsInvoke().mockResolvedValue({ compress: false });
    const { result } = renderHook(() => useHermesCapabilities('conv-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getCapsInvoke()).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.refresh();
    });
    expect(getCapsInvoke()).toHaveBeenCalledTimes(2);
  });
});

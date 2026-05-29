/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHermesErrorNotifier } from '@/renderer/hooks/hermes/useHermesErrorNotifier';

const { messageErrorMock } = vi.hoisted(() => ({
  messageErrorMock: vi.fn(),
}));

vi.mock('@/renderer/hooks/useMessage', () => ({
  useMessage: () => [{ error: messageErrorMock }],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('useHermesErrorNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show a toast on initial null status', () => {
    renderHook(() => useHermesErrorNotifier({ agentStatus: null }));
    expect(messageErrorMock).not.toHaveBeenCalled();
  });

  it('shows a toast when status transitions from null to "error"', () => {
    const { rerender } = renderHook(
      ({ agentStatus }: { agentStatus: string | null }) => useHermesErrorNotifier({ agentStatus }),
      { initialProps: { agentStatus: null } }
    );

    expect(messageErrorMock).not.toHaveBeenCalled();

    rerender({ agentStatus: 'error' });

    expect(messageErrorMock).toHaveBeenCalledTimes(1);
  });

  it('shows a toast when status transitions from "connected" to "disconnected"', () => {
    const { rerender } = renderHook(
      ({ agentStatus }: { agentStatus: string | null }) => useHermesErrorNotifier({ agentStatus }),
      { initialProps: { agentStatus: 'connected' } }
    );

    expect(messageErrorMock).not.toHaveBeenCalled();

    rerender({ agentStatus: 'disconnected' });

    expect(messageErrorMock).toHaveBeenCalledTimes(1);
  });

  it('does not show a toast when status transitions from null to "connecting"', () => {
    const { rerender } = renderHook(
      ({ agentStatus }: { agentStatus: string | null }) => useHermesErrorNotifier({ agentStatus }),
      { initialProps: { agentStatus: null } }
    );

    rerender({ agentStatus: 'connecting' });

    expect(messageErrorMock).not.toHaveBeenCalled();
  });

  it('does not show a duplicate toast when "error" status is repeated', () => {
    const { rerender } = renderHook(
      ({ agentStatus }: { agentStatus: string | null }) => useHermesErrorNotifier({ agentStatus }),
      { initialProps: { agentStatus: null } }
    );

    rerender({ agentStatus: 'error' });
    expect(messageErrorMock).toHaveBeenCalledTimes(1);

    rerender({ agentStatus: 'error' });
    expect(messageErrorMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controlled capability state for the hook mock
const capsState: { capabilities: Record<string, boolean> | null; unsupported: boolean } = {
  capabilities: null,
  unsupported: false,
};

vi.mock('@/renderer/hooks/hermes/useHermesCapabilities', () => ({
  useHermesCapabilities: () => ({ ...capsState, loading: false, refresh: vi.fn() }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      hermesExt: {
        compress: { invoke: vi.fn().mockResolvedValue(undefined) },
        retry: { invoke: vi.fn().mockResolvedValue(undefined) },
        undo: { invoke: vi.fn().mockResolvedValue(undefined) },
        forkSession: { invoke: vi.fn().mockResolvedValue({ session_id: 'new-id' }) },
        listCheckpoints: { invoke: vi.fn().mockResolvedValue([]) },
        restoreCheckpoint: { invoke: vi.fn().mockResolvedValue(undefined) },
      },
    },
  },
}));

vi.mock('@/renderer/hooks/useMessage', () => ({
  useMessage: () => [{ success: vi.fn(), error: vi.fn() }, null],
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { render } from '@testing-library/react';
import React from 'react';
import HermesActionStrip from '@/renderer/components/hermes/HermesActionStrip';

const baseProps = {
  conversation_id: 'conv-1',
  running: false,
  tokenUsage: null,
  context_limit: 0,
};

describe('HermesActionStrip', () => {
  beforeEach(() => {
    capsState.capabilities = null;
    capsState.unsupported = false;
  });

  it('renders nothing when capabilities are null (not Hermes)', () => {
    capsState.capabilities = null;
    const { container } = render(<HermesActionStrip {...baseProps} />);
    expect(container.textContent).toBe('');
  });

  it('renders nothing when unsupported', () => {
    capsState.unsupported = true;
    const { container } = render(<HermesActionStrip {...baseProps} />);
    expect(container.textContent).toBe('');
  });

  it('renders nothing when no capability is enabled and no context limit', () => {
    capsState.capabilities = {};
    const { container } = render(<HermesActionStrip {...baseProps} />);
    expect(container.textContent).toBe('');
  });

  it('shows Compress action when compress capability is enabled', () => {
    capsState.capabilities = { compress: true };
    const { getByText } = render(<HermesActionStrip {...baseProps} />);
    expect(getByText('settings.hermes.conversationActions.compress')).toBeTruthy();
  });

  it('shows Retry action when retry capability is enabled', () => {
    capsState.capabilities = { retry: true };
    const { getByText } = render(<HermesActionStrip {...baseProps} />);
    expect(getByText('settings.hermes.conversationActions.retry')).toBeTruthy();
  });

  it('shows Undo action when undo capability is enabled', () => {
    capsState.capabilities = { undo: true };
    const { getByText } = render(<HermesActionStrip {...baseProps} />);
    expect(getByText('settings.hermes.conversationActions.undo')).toBeTruthy();
  });

  it('shows Fork action when forkSession capability is enabled', () => {
    capsState.capabilities = { forkSession: true };
    const { getByText } = render(<HermesActionStrip {...baseProps} />);
    expect(getByText('settings.hermes.conversationActions.fork')).toBeTruthy();
  });

  it('shows Checkpoints action when rollback capability is enabled', () => {
    capsState.capabilities = { rollback: true };
    const { getByText } = render(<HermesActionStrip {...baseProps} />);
    expect(getByText('settings.hermes.conversationActions.checkpoints')).toBeTruthy();
  });

  it('renders context bar when context_limit > 0 even with no capabilities', () => {
    capsState.capabilities = {};
    const { container } = render(
      <HermesActionStrip {...baseProps} context_limit={1000} tokenUsage={{ total_tokens: 500 }} />
    );
    // The context bar div should be present
    expect(container.querySelector('div')).toBeTruthy();
    expect(container.textContent).not.toBe('');
  });
});

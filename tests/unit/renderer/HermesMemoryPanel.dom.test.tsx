/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import MemoryPanel from '@/renderer/pages/settings/HermesSettings/MemoryPanel';

const translate = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Refresh: () => <span data-testid='refresh-icon' />,
  Save: () => <span data-testid='save-icon' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: ({ content, title }: { content?: React.ReactNode; title?: React.ReactNode }) => (
    <div role='alert'>
      {title}
      {content}
    </div>
  ),
  Button: ({
    children,
    disabled,
    loading: _loading,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
  }) => (
    <button type='button' disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Input: {
    TextArea: ({
      onChange,
      placeholder,
      value,
    }: {
      onChange?: (value: string) => void;
      placeholder?: string;
      value?: string;
    }) => <textarea placeholder={placeholder} value={value} onChange={(event) => onChange?.(event.target.value)} />,
  },
  Message: {
    error: vi.fn(),
    success: vi.fn(),
  },
  Spin: () => <div data-testid='spin' />,
  Typography: {
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  },
}));

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

describe('Hermes Memory settings panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipcBridge.acpConversation.hermesExt.getMemory.invoke).mockResolvedValue({
      memory: 'project memory',
      user: 'user profile',
    });
    vi.mocked(ipcBridge.acpConversation.hermesExt.setMemory.invoke).mockResolvedValue(undefined);
  });

  it('renders loaded MEMORY.md and USER.md content', async () => {
    render(<MemoryPanel />);

    expect(await screen.findByDisplayValue('project memory')).toBeInTheDocument();
    expect(screen.getByDisplayValue('user profile')).toBeInTheDocument();
  });

  it('saves dirty memory content', async () => {
    render(<MemoryPanel />);

    fireEvent.change(await screen.findByDisplayValue('project memory'), { target: { value: 'updated memory' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(ipcBridge.acpConversation.hermesExt.setMemory.invoke).toHaveBeenCalledWith({
        memory: 'updated memory',
        user: 'user profile',
      });
    });
    expect(Message.success).toHaveBeenCalledWith('settings.hermes.memory.saveSuccess');
  });

  it('shows an error toast when save fails', async () => {
    vi.mocked(ipcBridge.acpConversation.hermesExt.setMemory.invoke).mockRejectedValue(new Error('boom'));

    render(<MemoryPanel />);

    fireEvent.change(await screen.findByDisplayValue('user profile'), { target: { value: 'updated user' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(Message.error).toHaveBeenCalledWith('settings.hermes.memory.saveError');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('settings.hermes.memory.saveError');
  });
});

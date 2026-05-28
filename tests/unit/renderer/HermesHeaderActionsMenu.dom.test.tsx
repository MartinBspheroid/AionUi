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
import HermesHeaderActionsMenu from '@/renderer/pages/conversation/components/HermesHeaderActionsMenu';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  MoreOne: () => <span data-testid='more-icon' />,
}));

vi.mock('@arco-design/web-react', () => {
  const Menu = ({
    children,
    onClickMenuItem,
  }: {
    children: React.ReactNode;
    onClickMenuItem?: (key: string) => void;
  }) => (
    <div>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<{ children: React.ReactNode }>(child)) return child;
        const itemKey = typeof child.key === 'string' ? child.key : '';
        return (
          <button type='button' onClick={() => onClickMenuItem?.(itemKey)}>
            {child.props.children}
          </button>
        );
      })}
    </div>
  );
  Menu.Item = ({ children }: { children: React.ReactNode }) => <>{children}</>;

  return {
    Button: ({
      disabled,
      icon,
      loading: _loading,
    }: {
      disabled?: boolean;
      icon?: React.ReactNode;
      loading?: boolean;
    }) => (
      <button type='button' disabled={disabled} aria-label='Hermes actions'>
        {icon}
      </button>
    ),
    Dropdown: ({
      children,
      disabled,
      droplist,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      droplist: React.ReactNode;
    }) => (
      <div>
        {children}
        {!disabled && droplist}
      </div>
    ),
    Menu,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
    },
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getSlashCommands: { invoke: vi.fn() },
      sendMessage: { invoke: vi.fn() },
    },
  },
}));

describe('HermesHeaderActionsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipcBridge.acpConversation.sendMessage.invoke).mockResolvedValue({ msg_id: 'msg-1' });
  });

  it('renders only advertised target commands', async () => {
    vi.mocked(ipcBridge.acpConversation.getSlashCommands.invoke).mockResolvedValue([
      { command: 'compress', description: 'Compress context' },
      { command: 'retry', description: 'Retry last turn' },
      { command: 'help', description: 'Help' },
    ]);

    render(<HermesHeaderActionsMenu conversation_id='conv-1' />);

    expect(await screen.findByRole('button', { name: 'Compact' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Help' })).not.toBeInTheDocument();
  });

  it('sends the advertised compact slash command', async () => {
    vi.mocked(ipcBridge.acpConversation.getSlashCommands.invoke).mockResolvedValue([
      { command: '/compact', description: 'Compact context' },
    ]);

    render(<HermesHeaderActionsMenu conversation_id='conv-1' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compact' }));

    await waitFor(() => {
      expect(ipcBridge.acpConversation.sendMessage.invoke).toHaveBeenCalledWith({
        conversation_id: 'conv-1',
        input: '/compact',
      });
    });
    expect(Message.success).toHaveBeenCalledWith('Command sent');
  });

  it('renders nothing when no target commands are advertised', async () => {
    vi.mocked(ipcBridge.acpConversation.getSlashCommands.invoke).mockResolvedValue([
      { command: 'help', description: 'Help' },
    ]);

    const { container } = render(<HermesHeaderActionsMenu conversation_id='conv-1' />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});

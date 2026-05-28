/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import SessionsPanel from '@/renderer/pages/settings/HermesSettings/SessionsPanel';

const translate = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Refresh: () => <span data-testid='refresh-icon' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: ({ content, title }: { content?: React.ReactNode; title?: React.ReactNode }) => (
    <div role='alert'>
      {title}
      {content}
    </div>
  ),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Spin: () => <div data-testid='spin' />,
  Table: ({
    columns,
    data,
  }: {
    columns: Array<{
      dataIndex?: string;
      render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode;
    }>;
    data: Array<Record<string, unknown>>;
  }) => (
    <table>
      <tbody>
        {data.map((record) => (
          <tr key={String(record.id)}>
            {columns.map((column) => (
              <td key={column.dataIndex}>
                {column.render
                  ? column.render(record[column.dataIndex ?? ''], record)
                  : String(record[column.dataIndex ?? ''])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Typography: {
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      hermesExt: {
        listSessions: { invoke: vi.fn() },
      },
    },
  },
}));

describe('Hermes Sessions settings panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipcBridge.acpConversation.hermesExt.listSessions.invoke).mockResolvedValue({
      sessions: [
        {
          id: 'session-1',
          title: 'Build parity',
          model: 'gpt-5',
          platform: 'gateway',
          last_updated: '2026-05-03T11:00:00.000Z',
        },
      ],
    });
  });

  it('renders loaded session summaries', async () => {
    render(<SessionsPanel />);

    expect(await screen.findByText('Build parity')).toBeInTheDocument();
    expect(screen.getByText('session-1')).toBeInTheDocument();
    expect(screen.getByText('gpt-5')).toBeInTheDocument();
    expect(screen.getByText('gateway')).toBeInTheDocument();
  });

  it('renders an empty state when no sessions exist', async () => {
    vi.mocked(ipcBridge.acpConversation.hermesExt.listSessions.invoke).mockResolvedValue({ sessions: [] });

    render(<SessionsPanel />);

    expect(await screen.findByText('settings.hermes.sessions.empty')).toBeInTheDocument();
  });

  it('renders an unsupported warning for a missing sessions endpoint', async () => {
    vi.mocked(ipcBridge.acpConversation.hermesExt.listSessions.invoke).mockRejectedValue({
      name: 'BackendHttpError',
      status: 404,
      code: 'NOT_FOUND',
    });

    render(<SessionsPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('settings.hermes.sessions.unsupportedTitle');
    expect(screen.getByRole('alert')).toHaveTextContent('settings.hermes.sessions.unsupportedDescription');
  });
});

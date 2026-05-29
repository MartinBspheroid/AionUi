/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import SubagentHierarchyView from '@/renderer/components/hermes/SubagentHierarchyView';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

type MockTreeNode = {
  key: string;
  title: React.ReactNode;
  children?: MockTreeNode[];
};

function MockTreeList({ treeData, onSelect }: { treeData: MockTreeNode[]; onSelect?: (keys: string[]) => void }) {
  return (
    <ul>
      {treeData.map((n) => (
        <li key={n.key} onClick={() => onSelect?.([n.key])}>
          {n.title}
          {n.children && n.children.length > 0 && <MockTreeList treeData={n.children} onSelect={onSelect} />}
        </li>
      ))}
    </ul>
  );
}

vi.mock('@arco-design/web-react', () => ({
  Tree: ({ treeData, onSelect }: { treeData: MockTreeNode[]; onSelect?: (keys: string[]) => void }) => (
    <MockTreeList treeData={treeData} onSelect={onSelect} />
  ),
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Typography: {
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const root = {
  id: 'root-id',
  name: 'Root Agent',
  type: 'acp',
  extra: { team_id: 'team-1' },
} as unknown as TChatConversation;

const child1 = {
  id: 'child-1',
  name: 'Sub Agent A',
  type: 'acp',
  extra: { team_id: 'root-id' },
} as unknown as TChatConversation;

const unrelated = {
  id: 'other',
  name: 'Other',
  type: 'acp',
  extra: { team_id: 'other-team' },
} as unknown as TChatConversation;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SubagentHierarchyView', () => {
  it('shows "No subagent sessions" when rootConversation is undefined', () => {
    render(<SubagentHierarchyView />);
    expect(screen.getByText('No subagent sessions')).toBeTruthy();
  });

  it('renders root conversation name', () => {
    render(<SubagentHierarchyView rootConversation={root} allConversations={[root, child1, unrelated]} />);
    expect(screen.getByText('Root Agent')).toBeTruthy();
  });

  it('does NOT include root itself in the rendered children', () => {
    render(<SubagentHierarchyView rootConversation={root} allConversations={[root, child1, unrelated]} />);
    // Root Agent appears exactly once (as the root node title), not as a child entry
    const matches = screen.getAllByText('Root Agent');
    expect(matches).toHaveLength(1);
  });

  it('includes child1 which shares team_id with root id', () => {
    render(<SubagentHierarchyView rootConversation={root} allConversations={[root, child1, unrelated]} />);
    expect(screen.getByText('Sub Agent A')).toBeTruthy();
  });

  it('does NOT include unrelated conversation with a different team_id', () => {
    render(<SubagentHierarchyView rootConversation={root} allConversations={[root, child1, unrelated]} />);
    expect(screen.queryByText('Other')).toBeNull();
  });

  it('calls onSelectSession with the correct id when a node is clicked', async () => {
    const onSelectSession = vi.fn();
    render(
      <SubagentHierarchyView
        rootConversation={root}
        allConversations={[root, child1]}
        onSelectSession={onSelectSession}
      />
    );

    await userEvent.click(screen.getByText('Sub Agent A'));
    expect(onSelectSession).toHaveBeenCalledWith('child-1');
  });
});

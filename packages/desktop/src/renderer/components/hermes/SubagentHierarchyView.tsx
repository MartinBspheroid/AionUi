/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { Tag } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// ── Types ──────────────────────────────────────────────────────────────────

export type SubagentNode = {
  conversation: TChatConversation;
  children: SubagentNode[];
};

type Props = {
  rootConversation?: TChatConversation;
  allConversations?: TChatConversation[];
  onSelectSession?: (conversationId: string) => void;
  className?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Builds a SubagentNode tree from a root conversation and a flat list of all
 * conversations. Children are grouped under their parent by `extra.team_id`.
 */
export function buildTree(root: TChatConversation, all: TChatConversation[]): SubagentNode {
  const rootId = root.id;

  // Collect direct children: conversations whose team_id matches root id
  const directChildren = all.filter((c) => {
    if (c.id === rootId) return false;
    const extra = c.extra as Record<string, unknown> | undefined;
    return extra?.team_id === rootId;
  });

  return {
    conversation: root,
    children: directChildren.map((child) => buildTree(child, all)),
  };
}

const getAgentType = (conv: TChatConversation): string => conv.type ?? 'acp';

const getStatus = (conv: TChatConversation): TChatConversation['status'] => conv.status;

const STATUS_COLOR_MAP: Record<string, string> = {
  pending: 'orange',
  running: 'blue',
  finished: 'green',
};

// ── Node title renderer ────────────────────────────────────────────────────

type NodeTitleProps = {
  node: SubagentNode;
  onSelect?: (id: string) => void;
};

const NodeTitle: React.FC<NodeTitleProps> = ({ node, onSelect }) => {
  const { conversation } = node;
  const agentType = getAgentType(conversation);
  const status = getStatus(conversation);

  return (
    <span className='flex items-center gap-1 cursor-pointer min-w-0' onClick={() => onSelect?.(conversation.id)}>
      <span className='flex-1 truncate text-sm' title={conversation.name} style={{ maxWidth: 160 }}>
        {conversation.name}
      </span>
      <Tag size='small' color='arcoblue'>
        {agentType}
      </Tag>
      {status && (
        <Tag size='small' color={STATUS_COLOR_MAP[status] ?? 'gray'}>
          {status}
        </Tag>
      )}
    </span>
  );
};

// ── Tree data conversion ───────────────────────────────────────────────────

function renderNode(node: SubagentNode, depth: number, onSelect?: (id: string) => void): React.ReactNode {
  return (
    <div key={node.conversation.id} style={{ paddingLeft: depth * 16 }} className='flex flex-col gap-4px'>
      <NodeTitle node={node} onSelect={onSelect} />
      {node.children.map((child) => renderNode(child, depth + 1, onSelect))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

const SubagentHierarchyView: React.FC<Props> = ({
  rootConversation,
  allConversations = [],
  onSelectSession,
  className,
}) => {
  const { t } = useTranslation();

  const rootNode = useMemo<SubagentNode | null>(() => {
    if (!rootConversation) return null;
    return buildTree(rootConversation, allConversations);
  }, [rootConversation, allConversations]);

  if (!rootNode) {
    return (
      <div className={className}>
        <span className='text-color-3 text-sm'>
          {t('hermes.subagentHierarchy.empty', { defaultValue: 'No subagent sessions' })}
        </span>
      </div>
    );
  }

  return <div className={className}>{renderNode(rootNode, 0, onSelectSession)}</div>;
};

export default SubagentHierarchyView;

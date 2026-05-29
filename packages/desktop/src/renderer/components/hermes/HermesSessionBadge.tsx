/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { Tag, Tooltip } from '@arco-design/web-react';
import { MindmapList } from '@icon-park/react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

type Props = { conversation?: TChatConversation };

const HermesSessionBadge: React.FC<Props> = ({ conversation: _conversation }) => {
  const navigate = useNavigate();
  return (
    <Tooltip content='Hermes settings'>
      <Tag
        className='cursor-pointer select-none !text-11px'
        icon={<MindmapList size={11} />}
        onClick={() => void navigate('/settings/hermes')}
      >
        Hermes
      </Tag>
    </Tooltip>
  );
};

export default HermesSessionBadge;

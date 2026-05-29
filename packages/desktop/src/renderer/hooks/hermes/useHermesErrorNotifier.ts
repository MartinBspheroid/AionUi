/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMessage } from '@/renderer/hooks/useMessage';

type Props = {
  agentStatus: string | null | undefined;
};

/**
 * Side-effect hook that shows an error toast when the agent transitions to
 * 'error' or 'disconnected'. Addresses hermes-webui #373.
 */
export function useHermesErrorNotifier({ agentStatus }: Props): void {
  const { t } = useTranslation();
  const [message] = useMessage();
  const previousStatus = useRef<string | null | undefined>(agentStatus);

  useEffect(() => {
    const prev = previousStatus.current;
    const current = agentStatus;

    if (prev !== current && (current === 'error' || current === 'disconnected')) {
      message.error(t('conversation.agentConnectionLost'));
    }

    previousStatus.current = current;
  }, [agentStatus, message, t]);
}

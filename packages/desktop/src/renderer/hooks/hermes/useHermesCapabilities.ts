/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { HermesCapabilities } from '@/common/types/hermes/hermesExt';
import { useCallback, useEffect, useState } from 'react';

type CapabilityState = {
  capabilities: HermesCapabilities | null;
  loading: boolean;
  unsupported: boolean;
};

/**
 * Fetches Hermes capabilities for a specific conversation.
 * Returns null + unsupported=true when the backend 404s (not a Hermes agent).
 * Stale responses are dropped when conversation_id changes mid-flight.
 */
export function useHermesCapabilities(
  conversation_id: string | undefined,
  options: { enabled?: boolean } = {}
): CapabilityState & { refresh: () => void } {
  const { enabled = true } = options;
  const [state, setState] = useState<CapabilityState>({
    capabilities: null,
    loading: false,
    unsupported: false,
  });
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!conversation_id || !enabled) {
      setState({ capabilities: null, loading: false, unsupported: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    ipcBridge.acpConversation.hermesExt.getCapabilities
      .invoke({ conversation_id })
      .then((caps) => {
        if (!cancelled) setState({ capabilities: caps, loading: false, unsupported: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const is404 = (err as { status?: number })?.status === 404;
        setState({ capabilities: null, loading: false, unsupported: is404 });
      });
    return () => {
      cancelled = true;
    };
  }, [conversation_id, enabled, nonce]);

  return { ...state, refresh };
}

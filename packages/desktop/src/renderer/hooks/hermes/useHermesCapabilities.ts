/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { HermesCapabilities } from '@/common/types/hermes/hermesExt';
import { useCallback, useEffect, useRef, useState } from 'react';

type CapabilityState = {
  capabilities: HermesCapabilities | null;
  loading: boolean;
  unsupported: boolean;
};

/**
 * Fetches Hermes capabilities for a specific conversation.
 * Returns null + unsupported=true when the backend 404s (not a Hermes agent).
 * Re-fetches when conversation_id or enabled changes.
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
  const inflightRef = useRef(false);

  const fetchCaps = useCallback(async () => {
    if (!conversation_id || !enabled || inflightRef.current) return;
    inflightRef.current = true;
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const caps = await ipcBridge.acpConversation.hermesExt.getCapabilities.invoke({ conversation_id });
      setState({ capabilities: caps, loading: false, unsupported: false });
    } catch (err) {
      const is404 = (err as { status?: number })?.status === 404;
      setState({ capabilities: null, loading: false, unsupported: is404 });
    } finally {
      inflightRef.current = false;
    }
  }, [conversation_id, enabled]);

  useEffect(() => {
    void fetchCaps();
  }, [fetchCaps]);

  return { ...state, refresh: fetchCaps };
}

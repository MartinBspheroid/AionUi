/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useComposerKeyHandler } from '@/renderer/hooks/chat/useMobileKeyboard';
import type React from 'react';

type FakeEvent = React.KeyboardEvent<HTMLTextAreaElement> & { preventDefault: ReturnType<typeof vi.fn> };

function fakeEvent(key: string, mods: { shift?: boolean; ctrl?: boolean; meta?: boolean } = {}): FakeEvent {
  return {
    key,
    shiftKey: !!mods.shift,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    preventDefault: vi.fn(),
    isTrusted: true,
  } as unknown as FakeEvent;
}

describe('useComposerKeyHandler', () => {
  function getHandler(sendOnEnter: boolean, hasPhysicalKeyboard: boolean) {
    const onSend = vi.fn();
    const { result } = renderHook(() => useComposerKeyHandler({ onSend, sendOnEnter, hasPhysicalKeyboard }));
    return { onSend, handler: result.current };
  }

  it('Shift+Enter does NOT call onSend', () => {
    const { onSend, handler } = getHandler(true, false);
    const e = fakeEvent('Enter', { shift: true });
    handler(e);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Ctrl+Enter calls onSend and prevents default', () => {
    const { onSend, handler } = getHandler(false, false);
    const e = fakeEvent('Enter', { ctrl: true });
    handler(e);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('Meta+Enter calls onSend and prevents default', () => {
    const { onSend, handler } = getHandler(false, false);
    const e = fakeEvent('Enter', { meta: true });
    handler(e);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('plain Enter with sendOnEnter=true calls onSend', () => {
    const { onSend, handler } = getHandler(true, false);
    const e = fakeEvent('Enter');
    handler(e);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('plain Enter with sendOnEnter=false and no physical keyboard does NOT call onSend', () => {
    const { onSend, handler } = getHandler(false, false);
    const e = fakeEvent('Enter');
    handler(e);
    expect(onSend).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('plain Enter with hasPhysicalKeyboard=true calls onSend regardless of sendOnEnter', () => {
    const { onSend, handler } = getHandler(false, true);
    const e = fakeEvent('Enter');
    handler(e);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('non-Enter keys are ignored', () => {
    const { onSend, handler } = getHandler(true, true);
    const e = fakeEvent('a');
    handler(e);
    expect(onSend).not.toHaveBeenCalled();
  });
});

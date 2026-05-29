/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMemoryInvoke = vi.fn();
const setMemoryInvoke = vi.fn();
const successFn = vi.fn();
const errorFn = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      hermesExt: {
        getMemory: { invoke: (...a: unknown[]) => getMemoryInvoke(...a) },
        setMemory: { invoke: (...a: unknown[]) => setMemoryInvoke(...a) },
      },
    },
  },
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  isBackendHttpError: (e: unknown) => typeof e === 'object' && e !== null && 'status' in e,
}));

vi.mock('@/renderer/hooks/useMessage', () => ({
  useMessage: () => [{ success: successFn, error: errorFn }, null],
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import HermesMemoryQuickSave from '@/renderer/components/hermes/HermesMemoryQuickSave';

describe('HermesMemoryQuickSave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a trigger button', () => {
    const { container } = render(<HermesMemoryQuickSave conversation_id='conv-1' />);
    expect(container.querySelector('button')).toBeTruthy();
  });

  it('appends note to existing memory on save', async () => {
    getMemoryInvoke.mockResolvedValue({ memory: 'existing content', user: '' });
    setMemoryInvoke.mockResolvedValue(undefined);

    const { container, getByRole } = render(<HermesMemoryQuickSave conversation_id='conv-1' />);
    // Open popover
    const trigger = container.querySelector('button');
    if (trigger) fireEvent.click(trigger);

    // Find textarea and type
    await waitFor(() => {
      const textarea = document.querySelector('textarea');
      expect(textarea).toBeTruthy();
    });
    const textarea = document.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'remember this' } });

    // Find and click the Save button (the one with the success-type label)
    const buttons = Array.from(document.querySelectorAll('button'));
    const saveBtn = buttons.find((b) => /memorySave|save/i.test(b.textContent || ''));
    if (saveBtn) fireEvent.click(saveBtn);

    await waitFor(() => expect(setMemoryInvoke).toHaveBeenCalled());
    const callArg = setMemoryInvoke.mock.calls[0][0];
    expect(callArg.memory).toBe('existing content\n\nremember this');
  });

  it('does not add a leading separator when existing memory is empty', async () => {
    getMemoryInvoke.mockResolvedValue({ memory: '', user: '' });
    setMemoryInvoke.mockResolvedValue(undefined);

    const { container } = render(<HermesMemoryQuickSave conversation_id='conv-1' />);
    const trigger = container.querySelector('button');
    if (trigger) fireEvent.click(trigger);

    await waitFor(() => {
      const textarea = document.querySelector('textarea');
      expect(textarea).toBeTruthy();
    });
    const textarea = document.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'first note' } });

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveBtn = buttons.find((b) => /memorySave|save/i.test(b.textContent || ''));
    if (saveBtn) fireEvent.click(saveBtn);

    await waitFor(() => expect(setMemoryInvoke).toHaveBeenCalled());
    const callArg = setMemoryInvoke.mock.calls[0][0];
    expect(callArg).toEqual({ memory: 'first note' });
    expect(callArg.memory.startsWith('\n\n')).toBe(false);
  });

  it('treats whitespace-only existing memory as empty (no leading separator)', async () => {
    getMemoryInvoke.mockResolvedValue({ memory: '   ', user: '' });
    setMemoryInvoke.mockResolvedValue(undefined);

    const { container } = render(<HermesMemoryQuickSave conversation_id='conv-1' />);
    const trigger = container.querySelector('button');
    if (trigger) fireEvent.click(trigger);

    await waitFor(() => {
      const textarea = document.querySelector('textarea');
      expect(textarea).toBeTruthy();
    });
    const textarea = document.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'note' } });

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveBtn = buttons.find((b) => /memorySave|save/i.test(b.textContent || ''));
    if (saveBtn) fireEvent.click(saveBtn);

    await waitFor(() => expect(setMemoryInvoke).toHaveBeenCalled());
    const callArg = setMemoryInvoke.mock.calls[0][0];
    // Whitespace-only memory has no separator prepended; the note is not preceded by '\n\n'.
    expect(callArg.memory).toBe('   note');
    expect(callArg.memory).not.toMatch(/\s*\n\nnote$/);
  });

  it('shows an error message when saving fails with a non-404 error', async () => {
    getMemoryInvoke.mockResolvedValue({ memory: 'existing content', user: '' });
    setMemoryInvoke.mockRejectedValue(new Error('boom'));

    const { container } = render(<HermesMemoryQuickSave conversation_id='conv-1' />);
    const trigger = container.querySelector('button');
    if (trigger) fireEvent.click(trigger);

    await waitFor(() => {
      const textarea = document.querySelector('textarea');
      expect(textarea).toBeTruthy();
    });
    const textarea = document.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'remember this' } });

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveBtn = buttons.find((b) => /memorySave|save/i.test(b.textContent || ''));
    if (saveBtn) fireEvent.click(saveBtn);

    await waitFor(() => expect(errorFn).toHaveBeenCalled());
    expect(successFn).not.toHaveBeenCalled();
  });
});

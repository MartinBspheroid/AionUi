/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ContextCompactionIndicator } from '@/renderer/components/hermes/ContextCompactionIndicator';

vi.mock('@arco-design/web-react', () => ({
  Progress: ({ percent, status }: { percent?: number; status?: string }) => (
    <div data-testid='progress' data-percent={percent} data-status={status} />
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Typography: {
    Text: ({ children, type }: { children: React.ReactNode; type?: string }) => (
      <span data-type={type}>{children}</span>
    ),
  },
}));

beforeAll(() => {
  // suppress react act warnings in tests
});

describe('ContextCompactionIndicator', () => {
  it('renders null for state=idle', () => {
    const { container } = render(<ContextCompactionIndicator state='idle' />);
    expect(container.firstChild).toBeNull();
  });

  it('shows queued label for state=queued', () => {
    const { getByText } = render(<ContextCompactionIndicator state='queued' />);
    expect(getByText('Context compression queued')).toBeTruthy();
  });

  it('shows compressing label for state=compressing', () => {
    const { getByText } = render(<ContextCompactionIndicator state='compressing' />);
    expect(getByText('Compressing context…')).toBeTruthy();
  });

  it('shows done label for state=done', () => {
    const { getByText } = render(<ContextCompactionIndicator state='done' />);
    expect(getByText('Context compressed')).toBeTruthy();
  });

  it('shows error label for state=error', () => {
    const { getByText } = render(<ContextCompactionIndicator state='error' />);
    expect(getByText('Context compression failed')).toBeTruthy();
  });

  it('custom message prop overrides default label', () => {
    const { getByText } = render(<ContextCompactionIndicator state='queued' message='Custom message' />);
    expect(getByText('Custom message')).toBeTruthy();
  });

  it('renders progress circle when contextPercent is provided', () => {
    const { getByTestId } = render(<ContextCompactionIndicator state='compressing' contextPercent={75} />);
    expect(getByTestId('progress')).toBeTruthy();
  });

  it('does NOT render progress when contextPercent is undefined', () => {
    const { queryByTestId } = render(<ContextCompactionIndicator state='queued' />);
    expect(queryByTestId('progress')).toBeNull();
  });

  it('has role=status and aria-label on container', () => {
    const { getByRole } = render(<ContextCompactionIndicator state='queued' />);
    const status = getByRole('status');
    expect(status).toBeTruthy();
    expect(status.getAttribute('aria-label')).toBe('Context compression queued');
  });
});

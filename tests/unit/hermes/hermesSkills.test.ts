/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleSkills } from '@/process/hermes/hermesSkills';

function mkRes() {
  const r: any = { status: 0, body: '', headers: {} };
  r.writeHead = (s: number, h?: any) => {
    r.status = s;
    if (h) r.headers = h;
    return r;
  };
  r.end = (b?: string) => {
    if (b) r.body = b;
  };
  return r;
}

function mkUrl(path: string): URL {
  return new URL('http://x' + path);
}

const ALPHA_SKILL = `---
name: alpha
description: "Alpha skill desc"
version: 1.2.3
metadata:
  hermes:
    tags: [a, b, c]
---
# Alpha body
`;

const BETA_SKILL = `---
name: beta
description: "Beta skill desc"
---
# Beta body
`;

const OLD_SKILL = `---
name: old
description: "Archived skill"
---
# Old body
`;

let home: string;

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-'));
  const skillsRoot = path.join(home, 'skills');

  // skills/alpha/SKILL.md (category '')
  const alphaDir = path.join(skillsRoot, 'alpha');
  await fs.mkdir(alphaDir, { recursive: true });
  await fs.writeFile(path.join(alphaDir, 'SKILL.md'), ALPHA_SKILL, 'utf-8');
  // sibling file so detail.files includes 'extra.md'
  await fs.writeFile(path.join(alphaDir, 'extra.md'), 'extra contents', 'utf-8');

  // skills/cat1/beta/SKILL.md (category 'cat1', name 'beta')
  const betaDir = path.join(skillsRoot, 'cat1', 'beta');
  await fs.mkdir(betaDir, { recursive: true });
  await fs.writeFile(path.join(betaDir, 'SKILL.md'), BETA_SKILL, 'utf-8');

  // skills/.archive/old/SKILL.md (dot dir — should be skipped)
  const oldDir = path.join(skillsRoot, '.archive', 'old');
  await fs.mkdir(oldDir, { recursive: true });
  await fs.writeFile(path.join(oldDir, 'SKILL.md'), OLD_SKILL, 'utf-8');
});

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe('handleSkills', () => {
  it('lists skills including alpha and cat1/beta, excluding .archive entries', async () => {
    const res = mkRes();
    await handleSkills(home, mkUrl('/api/agents/hermes/skills'), res);

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    const ids = body.skills.map((s: any) => s.id);

    expect(ids).toContain('alpha');
    expect(ids).toContain('cat1/beta');

    const alpha = body.skills.find((s: any) => s.id === 'alpha');
    expect(alpha.category).toBe('');
    const beta = body.skills.find((s: any) => s.id === 'cat1/beta');
    expect(beta).toBeTruthy();

    // Nothing under .archive should appear.
    expect(ids).not.toContain('old');
    expect(ids.some((id: string) => id.includes('archive') || id === 'old')).toBe(false);
  });

  it('parses the alpha summary fields', async () => {
    const res = mkRes();
    await handleSkills(home, mkUrl('/api/agents/hermes/skills'), res);

    const body = JSON.parse(res.body);
    const alpha = body.skills.find((s: any) => s.id === 'alpha');

    expect(alpha.description).toBe('Alpha skill desc');
    expect(alpha.version).toBe('1.2.3');
    expect(alpha.tags).toEqual(['a', 'b', 'c']);
  });

  it('reports categories including cat1 but not empty or .archive', async () => {
    const res = mkRes();
    await handleSkills(home, mkUrl('/api/agents/hermes/skills'), res);

    const body = JSON.parse(res.body);
    expect(body.categories).toContain('cat1');
    expect(body.categories).not.toContain('');
    expect(body.categories).not.toContain('.archive');
  });

  it('returns detail with content and sibling files for a known id', async () => {
    const res = mkRes();
    await handleSkills(home, mkUrl('/api/agents/hermes/skills?id=alpha'), res);

    expect(res.status).toBe(200);
    const detail = JSON.parse(res.body);
    expect(detail.content).toContain('# Alpha body');
    expect(detail.files).toContain('extra.md');
    expect(detail.files).not.toContain('SKILL.md');
  });

  it('returns 404 for an unknown id', async () => {
    const res = mkRes();
    await handleSkills(home, mkUrl('/api/agents/hermes/skills?id=does-not-exist'), res);

    expect(res.status).toBe(404);
  });
});

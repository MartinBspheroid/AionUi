/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Skills endpoint — list and inspect skills under HERMES_HOME/skills.
 *
 * A skill is a directory containing SKILL.md, either at depth 1
 * (`skills/<name>/SKILL.md`) or depth 2 (`skills/<category>/<name>/SKILL.md`).
 * SKILL.md begins with a YAML frontmatter block delimited by `---` lines; we
 * parse it with a tiny hand-rolled reader (no yaml dependency) to extract
 * description, version, and `metadata.hermes.tags`.
 */

import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import type { HermesSkillDetail, HermesSkillSummary, HermesSkillsResponse } from '@/common/types/hermes/hermesExt';
import { sendError, sendJson } from './hermesHttp';

const SKILL_FILE = 'SKILL.md';

type ParsedFrontmatter = {
  description: string;
  version?: string;
  tags: string[];
};

/** Strip a single layer of surrounding single or double quotes. */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/** Parse a `[a, b, c]` inline list into a trimmed, non-empty string array. */
function parseInlineList(value: string): string[] {
  const trimmed = value.trim();
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  return inner
    .split(',')
    .map((item) => stripQuotes(item).trim())
    .filter((item) => item.length > 0);
}

/**
 * Extract description / version / tags from the leading `---`-delimited YAML
 * frontmatter block. Returns empty defaults when no block is present.
 */
function parseFrontmatter(content: string): ParsedFrontmatter {
  const result: ParsedFrontmatter = { description: '', version: undefined, tags: [] };
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return result;

  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return result;

  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (result.description === '' && trimmed.startsWith('description:')) {
      result.description = stripQuotes(trimmed.slice('description:'.length));
    } else if (result.version === undefined && trimmed.startsWith('version:')) {
      const version = stripQuotes(trimmed.slice('version:'.length));
      if (version.length > 0) result.version = version;
    } else if (result.tags.length === 0 && trimmed.startsWith('tags:')) {
      result.tags = parseInlineList(trimmed.slice('tags:'.length));
    }
  }
  return result;
}

/** Build a HermesSkillSummary by reading and parsing a skill's SKILL.md. */
async function readSkillSummary(skillDir: string, category: string, name: string): Promise<HermesSkillSummary> {
  const content = await fs.readFile(path.join(skillDir, SKILL_FILE), 'utf-8');
  const fm = parseFrontmatter(content);
  return {
    name,
    category,
    id: category ? `${category}/${name}` : name,
    description: fm.description,
    version: fm.version,
    tags: fm.tags,
  };
}

/** True when `dir` directly contains a SKILL.md file. */
async function hasSkillFile(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(dir, SKILL_FILE));
    return stat.isFile();
  } catch {
    return false;
  }
}

/** Recursively list relative file paths under `dir`, excluding SKILL.md. */
async function listSkillFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string, prefix: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), rel);
      } else if (entry.isFile() && rel !== SKILL_FILE) {
        out.push(rel);
      }
    }
  }
  await walk(dir, '');
  return out.sort((a, b) => a.localeCompare(b));
}

/** Collect every skill (depth 1 and depth 2) under skillsRoot. */
async function collectSkills(skillsRoot: string): Promise<HermesSkillSummary[]> {
  const skills: HermesSkillSummary[] = [];
  let topEntries: Dirent[];
  try {
    topEntries = await fs.readdir(skillsRoot, { withFileTypes: true, encoding: 'utf-8' });
  } catch {
    return skills;
  }

  for (const top of topEntries) {
    if (!top.isDirectory()) continue;
    // Skip hidden / archive dirs (e.g. .archive) — not user-facing skills.
    if (top.name.startsWith('.')) continue;
    const topDir = path.join(skillsRoot, top.name);

    if (await hasSkillFile(topDir)) {
      try {
        skills.push(await readSkillSummary(topDir, '', top.name));
      } catch {
        // skip unreadable skill
      }
      continue;
    }

    let subEntries: Dirent[];
    try {
      subEntries = await fs.readdir(topDir, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      continue;
    }
    for (const sub of subEntries) {
      if (!sub.isDirectory()) continue;
      if (sub.name.startsWith('.')) continue;
      const subDir = path.join(topDir, sub.name);
      if (!(await hasSkillFile(subDir))) continue;
      try {
        skills.push(await readSkillSummary(subDir, top.name, sub.name));
      } catch {
        // skip unreadable skill
      }
    }
  }
  return skills;
}

export async function handleSkills(hermesHome: string, url: URL, res: ServerResponse): Promise<boolean> {
  const skillsRoot = path.join(hermesHome, 'skills');
  const skills = await collectSkills(skillsRoot);
  skills.sort((a, b) => a.id.localeCompare(b.id));

  const id = url.searchParams.get('id');
  if (id) {
    const summary = skills.find((skill) => skill.id === id);
    if (!summary) return sendError(res, 404, 'skill not found');

    const skillDir = summary.category
      ? path.join(skillsRoot, summary.category, summary.name)
      : path.join(skillsRoot, summary.name);
    const [content, files] = await Promise.all([
      fs.readFile(path.join(skillDir, SKILL_FILE), 'utf-8').catch(() => ''),
      listSkillFiles(skillDir),
    ]);
    const detail: HermesSkillDetail = { ...summary, content, files };
    return sendJson(res, 200, detail);
  }

  const categories = Array.from(
    new Set(skills.map((skill) => skill.category).filter((category) => category.length > 0))
  ).sort((a, b) => a.localeCompare(b));
  const response: HermesSkillsResponse = { skills, categories };
  sendJson(res, 200, response);
  return true;
}

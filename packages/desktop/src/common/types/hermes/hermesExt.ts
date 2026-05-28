/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type HermesMemoryPayload = {
  memory: string;
  user: string;
  memory_mtime?: string;
  user_mtime?: string;
};

export type HermesMemoryUpdate = {
  memory?: string;
  user?: string;
};

export type HermesSessionSummary = {
  id: string;
  title?: string;
  model?: string;
  platform?: string;
  session_start?: string;
  last_updated?: string;
  path?: string;
};

export type HermesSessionsResponse = {
  sessions: HermesSessionSummary[];
};

export type HermesCronJobSummary = {
  id: string;
  name: string;
  enabled: boolean;
  state?: string;
  schedule_display?: string;
  schedule_kind?: string;
  schedule_expr?: string;
  repeat_completed?: number;
  repeat_times?: number | null;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  last_error?: string;
  last_delivery_error?: string;
  deliver?: string;
  script?: string;
  no_agent?: boolean;
  workdir?: string;
  model?: string;
  provider?: string;
  skills?: string[];
};

export type HermesCronJobsResponse = {
  jobs: HermesCronJobSummary[];
  total: number;
  active: number;
  paused: number;
  errors: number;
};

export type HermesCliRunResult = {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export type HermesCliCommandSummary = {
  id: string;
  label: string;
  description: string;
  args: string[];
  category: string;
};

export type HermesCliConfigOverview = {
  version?: HermesCliRunResult;
  status?: HermesCliRunResult;
  config?: HermesCliRunResult;
};

export type HermesCliConfigResponse = {
  hermesHome: string;
  cliPath: string;
  configPath: string;
  envPath: string;
  commands: HermesCliCommandSummary[];
  overview: HermesCliConfigOverview;
};

export type HermesCliRunResponse = {
  command: HermesCliCommandSummary;
  result: HermesCliRunResult;
};

export type HermesCapabilities = {
  compress?: boolean;
  retry?: boolean;
  undo?: boolean;
  forkSession?: boolean;
  rollback?: boolean;
};

export type HermesCheckpoint = {
  id: string;
  timestamp?: string;
  label?: string;
};

export type HermesSkillSummary = {
  /** Folder name containing SKILL.md (unique within a category). */
  name: string;
  /** Top-level category folder, or empty string for uncategorized skills. */
  category: string;
  /** Stable identifier: `${category}/${name}` (or just `name` if uncategorized). */
  id: string;
  /** First paragraph from YAML frontmatter `description`, may be empty. */
  description: string;
  /** Optional semver string extracted from frontmatter. */
  version?: string;
  /** Tags from `metadata.hermes.tags`, may be empty. */
  tags: string[];
};

export type HermesSkillsResponse = {
  skills: HermesSkillSummary[];
  categories: string[];
};

export type HermesSkillDetail = HermesSkillSummary & {
  /** Full SKILL.md content. */
  content: string;
  /** Sibling files (relative paths, excluding SKILL.md itself). */
  files: string[];
};

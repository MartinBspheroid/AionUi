/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-system bridge — fs/skills REST routes plus the file-watch, file-stream
 * and snapshot WebSocket channels, and speech-to-text.
 */

import type { SpeechToTextRequest, SpeechToTextResult } from '@/common/types/provider/speech';
import { fromBackendCompareResult, type RawCompareResult } from '@/common/adapter/fileSnapshotMapper';
import { fromBackendWorkspaceFlatFiles, type RawWorkspaceFlatFile } from '@/common/adapter/workspaceMapper';
import { httpDelete, httpGet, httpPost, withResponseMap, wsEmitter } from '@/common/adapter/httpBridge';
import type { IDirOrFile } from './shared';

export interface IFileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
  isDirectory?: boolean;
}

export type IWorkspaceFlatFile = {
  name: string;
  fullPath: string;
  relativePath: string;
};

export const fs = {
  getFilesByDir: httpPost<Array<IDirOrFile>, { dir: string; root: string }>('/api/fs/dir'),
  listWorkspaceFiles: withResponseMap(
    httpPost<Array<RawWorkspaceFlatFile>, { root: string }>('/api/fs/list'),
    fromBackendWorkspaceFlatFiles
  ),
  getImageBase64: httpPost<string | null, { path: string; workspace?: string }>('/api/fs/image-base64'),
  fetchRemoteImage: httpPost<string, { url: string }>('/api/fs/fetch-remote-image'),
  readFile: httpPost<string | null, { path: string; workspace?: string }>('/api/fs/read'),
  readFileBuffer: httpPost<string | null, { path: string; workspace?: string }>('/api/fs/read-buffer'),
  createTempFile: httpPost<string, { file_name: string }>('/api/fs/temp'),
  writeFile: httpPost<boolean, { path: string; data: string }>('/api/fs/write'),
  createZip: httpPost<
    boolean,
    {
      path: string;
      request_id?: string;
      files: Array<{
        name: string;
        content?: string | Uint8Array;
        source_path?: string;
      }>;
    }
  >('/api/fs/zip'),
  cancelZip: httpPost<boolean, { request_id: string }>('/api/fs/zip/cancel'),
  getFileMetadata: httpPost<IFileMetadata, { path: string; workspace?: string }>('/api/fs/metadata'),
  copyFilesToWorkspace: httpPost<
    { copied_files: string[]; failed_files?: Array<{ path: string; error: string }> },
    { file_paths: string[]; workspace: string; source_root?: string }
  >('/api/fs/copy'),
  removeEntry: httpPost<void, { path: string }>('/api/fs/remove'),
  renameEntry: httpPost<{ new_path: string }, { path: string; new_name: string }>('/api/fs/rename'),
  readBuiltinRule: httpPost<string, { file_name: string }>('/api/skills/builtin-rule'),
  readBuiltinSkill: httpPost<string, { file_name: string }>('/api/skills/builtin-skill'),
  readAssistantRule: httpPost<string, { assistant_id: string; locale?: string }>('/api/skills/assistant-rule/read'),
  writeAssistantRule: httpPost<boolean, { assistant_id: string; content: string; locale?: string }>(
    '/api/skills/assistant-rule/write'
  ),
  deleteAssistantRule: httpDelete<boolean, { assistant_id: string }>(
    (p) => `/api/skills/assistant-rule/${p.assistant_id}`
  ),
  readAssistantSkill: httpPost<string, { assistant_id: string; locale?: string }>('/api/skills/assistant-skill/read'),
  writeAssistantSkill: httpPost<boolean, { assistant_id: string; content: string; locale?: string }>(
    '/api/skills/assistant-skill/write'
  ),
  deleteAssistantSkill: httpDelete<boolean, { assistant_id: string }>(
    (p) => `/api/skills/assistant-skill/${p.assistant_id}`
  ),
  listAvailableSkills: httpGet<
    Array<{
      name: string;
      description: string;
      location: string;
      relative_location?: string;
      is_custom: boolean;
      source: 'builtin' | 'custom' | 'extension';
    }>,
    void
  >('/api/skills'),
  listBuiltinAutoSkills: httpGet<Array<{ name: string; description: string; location: string }>, void>(
    '/api/skills/builtin-auto'
  ),
  materializeSkillsForAgent: httpPost<
    { skills: Array<{ name: string; source_path: string }> },
    { conversation_id: string; skills: string[] }
  >('/api/skills/materialize-for-agent'),
  readSkillInfo: httpPost<{ name: string; description: string }, { skill_path: string }>('/api/skills/info'),
  importSkill: httpPost<{ skill_name: string }, { skill_path: string }>('/api/skills/import'),
  scanForSkills: httpPost<Array<{ name: string; description: string; path: string }>, { folder_path: string }>(
    '/api/skills/scan'
  ),
  detectCommonSkillPaths: httpGet<Array<{ name: string; path: string }>, void>('/api/skills/detect-paths'),
  detectAndCountExternalSkills: httpGet<
    Array<{
      name: string;
      path: string;
      source: string;
      skills: Array<{ name: string; description: string; path: string }>;
    }>,
    void
  >('/api/skills/detect-external'),
  importSkillWithSymlink: httpPost<{ skill_name: string }, { skill_path: string }>('/api/skills/import-symlink'),
  deleteSkill: httpDelete<void, { skill_name: string }>((p) => `/api/skills/${p.skill_name}`),
  getSkillPaths: httpGet<{ user_skills_dir: string; builtin_skills_dir: string }, void>('/api/skills/paths'),
  getCustomExternalPaths: httpGet<Array<{ name: string; path: string }>, void>('/api/skills/external-paths'),
  addCustomExternalPath: httpPost<void, { name: string; path: string }>('/api/skills/external-paths'),
  removeCustomExternalPath: httpDelete<void, { path: string }>(
    (p) => `/api/skills/external-paths?path=${encodeURIComponent(p.path)}`
  ),
  enableSkillsMarket: httpPost<void, void>('/api/skills/market/enable'),
  disableSkillsMarket: httpPost<void, void>('/api/skills/market/disable'),
};

export const speechToText = {
  transcribe: httpPost<SpeechToTextResult, SpeechToTextRequest>('/api/stt'),
};

export const fileWatch = {
  startWatch: httpPost<void, { file_path: string }>('/api/fs/watch/start'),
  stopWatch: httpPost<void, { file_path: string }>('/api/fs/watch/stop'),
  stopAllWatches: httpPost<void, void>('/api/fs/watch/stop-all'),
  fileChanged: wsEmitter<{ file_path: string; event_type: string }>('fileWatch.fileChanged'),
};

// Workspace Office file watch
export const workspaceOfficeWatch = {
  start: httpPost<void, { workspace: string }>('/api/fs/office-watch/start'),
  stop: httpPost<void, { workspace: string }>('/api/fs/office-watch/stop'),
  fileAdded: wsEmitter<{ file_path: string; workspace: string }>('workspaceOfficeWatch.fileAdded'),
};

// File streaming updates (real-time content push when agent writes)
export const fileStream = {
  contentUpdate: wsEmitter<{
    file_path: string;
    content: string;
    workspace: string;
    relative_path: string;
    operation: 'write' | 'delete';
  }>('fileStream.contentUpdate'),
};

// File snapshot providers
export const fileSnapshot = {
  init: httpPost<import('@/common/types/platform/fileSnapshot').SnapshotInfo, { workspace: string }>(
    '/api/fs/snapshot/init'
  ),
  compare: withResponseMap(
    httpPost<RawCompareResult, { workspace: string }>('/api/fs/snapshot/compare'),
    fromBackendCompareResult
  ),
  getBaselineContent: httpPost<string | null, { workspace: string; file_path: string }>('/api/fs/snapshot/baseline'),
  getInfo: httpPost<import('@/common/types/platform/fileSnapshot').SnapshotInfo, { workspace: string }>(
    '/api/fs/snapshot/info'
  ),
  dispose: httpPost<void, { workspace: string }>('/api/fs/snapshot/dispose'),
  stageFile: httpPost<void, { workspace: string; file_path: string }>('/api/fs/snapshot/stage'),
  stageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/stage-all'),
  unstageFile: httpPost<void, { workspace: string; file_path: string }>('/api/fs/snapshot/unstage'),
  unstageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/unstage-all'),
  discardFile: httpPost<
    void,
    {
      workspace: string;
      file_path: string;
      operation: import('@/common/types/platform/fileSnapshot').FileChangeOperation;
    }
  >('/api/fs/snapshot/discard'),
  resetFile: httpPost<
    void,
    {
      workspace: string;
      file_path: string;
      operation: import('@/common/types/platform/fileSnapshot').FileChangeOperation;
    }
  >('/api/fs/snapshot/reset'),
  getBranches: httpPost<string[], { workspace: string }>('/api/fs/snapshot/branches'),
};

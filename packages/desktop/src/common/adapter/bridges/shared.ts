/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cross-cutting types shared by more than one bridge module. Domain-specific
 * types live next to the module that owns them; only types referenced by
 * multiple modules belong here.
 */

/** Standard envelope returned by Electron-native IPC providers. */
export interface IBridgeResponse<D = {}> {
  success: boolean;
  data?: D;
  msg?: string;
}

/** A file-system node used by both the conversation workspace and fs bridges. */
export interface IDirOrFile {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<IDirOrFile>;
}

/** Cursor/page envelope shared by the database list endpoints. */
export type PaginatedResult<T> = {
  items: T[];
  total: number;
  has_more: boolean;
};

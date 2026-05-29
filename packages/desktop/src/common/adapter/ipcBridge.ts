/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC Bridge → HTTP/WS adapter (barrel).
 *
 * This module replaces the original IPC bridge calls with HTTP REST and
 * WebSocket calls routed to aioncore. Electron-native operations (window
 * controls, native dialogs, auto-update, devtools, zoom, CDP, deep links)
 * remain as IPC.
 *
 * The implementation is split by domain under ./bridges/* to keep each file
 * focused and within the file-size guard. This barrel re-exports every bridge
 * object and type so existing `@/common/adapter/ipcBridge` imports keep working
 * unchanged — add new endpoints to the relevant domain module, not here.
 */

export * from './bridges/shared';
export * from './bridges/conversation';
export * from './bridges/agents';
export * from './bridges/fs';
export * from './bridges/providers';
export * from './bridges/office';
export * from './bridges/system';
export * from './bridges/cron';
export * from './bridges/collab';

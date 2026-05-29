/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Collaboration bridge — extensions API, messaging channels (Telegram/Lark/…),
 * and team mode. These share the "multi-source / multi-party" theme.
 */

import type { ICssTheme } from '@/common/config/storage';
import type {
  IChannelPairingRequest,
  IChannelPluginStatus,
  IChannelSession,
  IChannelUser,
} from '@/common/types/channel/channel';
import type {
  ITeamAgentRemovedEvent,
  ITeamAgentRenamedEvent,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
  ITeamCreatedEvent,
  ITeamListChangedEvent,
  ITeamTeammateMessageEvent,
  TTeam,
  TeamAgent,
} from '@/common/types/team/teamTypes';
import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
  withResponseMap,
  wsEmitter,
  wsMappedEmitter,
} from '@/common/adapter/httpBridge';
import type { IAddTeamAgentParams, ICreateTeamParams } from '@/common/adapter/teamMapper';
import {
  fromBackendAgent,
  fromBackendTeam,
  fromBackendTeamList,
  fromBackendTeamOptional,
  toBackendAgent,
} from '@/common/adapter/teamMapper';

export type { IAddTeamAgentParams, ICreateTeamParams } from '@/common/adapter/teamMapper';

// ---------------------------------------------------------------------------
// Extensions
// ---------------------------------------------------------------------------

export interface IExtensionInfo {
  name: string;
  display_name: string;
  version: string;
  description?: string;
  source: string;
  enabled: boolean;
}

export interface IExtensionPermissionSummary {
  name: string;
  description: string;
  level: 'safe' | 'moderate' | 'dangerous';
  granted: boolean;
}

export interface IExtensionSettingsTab {
  id: string;
  label: string;
  icon?: string;
  url: string;
  position?: { relativeTo: string; placement: 'before' | 'after' };
  order: number;
  extensionName: string;
}

export interface IExtensionWebuiContribution {
  extensionName: string;
  apiRoutes: Array<{ path: string; auth: boolean }>;
  staticAssets: Array<{ urlPrefix: string; directory: string }>;
}

export type AgentActivityState = 'idle' | 'writing' | 'researching' | 'executing' | 'syncing' | 'error';

export interface IExtensionAgentActivityEvent {
  conversationId: string;
  at: number;
  kind: 'status' | 'tool' | 'message';
  text: string;
}

export interface IExtensionAgentActivityItem {
  id: string;
  backend: string;
  agentName: string;
  state: AgentActivityState;
  runtimeStatus: 'pending' | 'running' | 'finished' | 'unknown';
  conversations: number;
  activeConversations: number;
  lastActiveAt: number;
  lastStatus?: string;
  currentTask?: string;
  recentEvents: IExtensionAgentActivityEvent[];
}

export interface IExtensionAgentActivitySnapshot {
  generatedAt: number;
  totalConversations: number;
  runningConversations: number;
  agents: IExtensionAgentActivityItem[];
}

export const extensions = {
  getThemes: httpGet<ICssTheme[], void>('/api/extensions/themes'),
  getLoadedExtensions: httpGet<IExtensionInfo[], void>('/api/extensions'),
  getAssistants: httpGet<Record<string, unknown>[], void>('/api/extensions/assistants'),
  getAgents: httpGet<Record<string, unknown>[], void>('/api/extensions/agents'),
  getAcpAdapters: httpGet<Record<string, unknown>[], void>('/api/extensions/acp-adapters'),
  getMcpServers: httpGet<Record<string, unknown>[], void>('/api/extensions/mcp-servers'),
  getSkills: httpGet<Array<{ name: string; description: string; location: string }>, void>('/api/extensions/skills'),
  getSettingsTabs: httpGet<IExtensionSettingsTab[], void>('/api/extensions/settings-tabs'),
  getWebuiContributions: httpGet<IExtensionWebuiContribution[], void>('/api/extensions/webui'),
  getAgentActivitySnapshot: httpGet<IExtensionAgentActivitySnapshot, void>('/api/extensions/agent-activity'),
  getExtI18nForLocale: httpPost<Record<string, unknown>, { locale: string }>('/api/extensions/i18n'),
  enableExtension: httpPost<void, { name: string }>('/api/extensions/enable'),
  disableExtension: httpPost<void, { name: string; reason?: string }>('/api/extensions/disable'),
  getPermissions: httpPost<IExtensionPermissionSummary[], { name: string }>('/api/extensions/permissions'),
  getRiskLevel: httpPost<string, { name: string }>('/api/extensions/risk-level'),
  stateChanged: wsEmitter<{ name: string; enabled: boolean; reason?: string }>('extensions.state-changed'),
};

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

type RawPluginStatus = Record<string, unknown>;
type RawPairing = Record<string, unknown>;
type RawUser = Record<string, unknown>;
type RawSession = Record<string, unknown>;

function toPluginStatus(raw: RawPluginStatus): IChannelPluginStatus {
  return {
    id: (raw.plugin_id ?? raw.id) as string,
    type: (raw.type ?? raw.plugin_type) as string,
    name: raw.name as string,
    enabled: raw.enabled as boolean,
    connected: (raw.connected ?? false) as boolean,
    status: raw.status as string | undefined,
    last_connected: raw.last_connected as number | undefined,
    activeUsers: (raw.active_users ?? 0) as number,
    botUsername: raw.bot_username as string | undefined,
    hasToken: (raw.has_token ?? false) as boolean,
    isExtension: raw.is_extension as boolean | undefined,
    extensionMeta: raw.extension_meta as IChannelPluginStatus['extensionMeta'],
  };
}

function toPairing(raw: RawPairing): IChannelPairingRequest {
  return {
    code: raw.code as string,
    platformUserId: raw.platform_user_id as string,
    platformType: raw.platform_type as string,
    display_name: raw.display_name as string | undefined,
    requestedAt: raw.requested_at as number,
    expiresAt: raw.expires_at as number,
  };
}

function toChannelUser(raw: RawUser): IChannelUser {
  return {
    id: raw.id as string,
    platformUserId: raw.platform_user_id as string,
    platformType: raw.platform_type as string,
    display_name: raw.display_name as string | undefined,
    authorizedAt: raw.authorized_at as number,
    lastActive: raw.last_active as number | undefined,
    session_id: raw.session_id as string | undefined,
  };
}

function toChannelSession(raw: RawSession): IChannelSession {
  return {
    id: raw.id as string,
    user_id: raw.user_id as string,
    agent_type: raw.agent_type as string,
    conversation_id: raw.conversation_id as string | undefined,
    workspace: raw.workspace as string | undefined,
    chatId: raw.chat_id as string | undefined,
    created_at: raw.created_at as number,
    lastActivity: raw.last_activity as number,
  };
}

export const channel = {
  getPluginStatus: withResponseMap(httpGet<RawPluginStatus[], void>('/api/channel/plugins'), (raw) =>
    raw.map(toPluginStatus)
  ),
  enablePlugin: httpPost<void, { plugin_id: string; config: Record<string, unknown> }>('/api/channel/plugins/enable'),
  disablePlugin: httpPost<void, { plugin_id: string }>('/api/channel/plugins/disable'),
  testPlugin: httpPost<
    { success: boolean; bot_username?: string; error?: string },
    { plugin_id: string; token: string; extra_config?: { app_id?: string; app_secret?: string } }
  >('/api/channel/plugins/test'),
  getPendingPairings: withResponseMap(httpGet<RawPairing[], void>('/api/channel/pairings'), (raw) =>
    raw.map(toPairing)
  ),
  approvePairing: httpPost<void, { code: string }>('/api/channel/pairings/approve'),
  rejectPairing: httpPost<void, { code: string }>('/api/channel/pairings/reject'),
  getAuthorizedUsers: withResponseMap(httpGet<RawUser[], void>('/api/channel/users'), (raw) => raw.map(toChannelUser)),
  revokeUser: httpPost<void, { user_id: string }>('/api/channel/users/revoke'),
  getActiveSessions: withResponseMap(httpGet<RawSession[], void>('/api/channel/sessions'), (raw) =>
    raw.map(toChannelSession)
  ),
  syncChannelSettings: httpPost<void, { platform: string }>('/api/channel/settings/sync'),
  pairingRequested: wsMappedEmitter<IChannelPairingRequest>('channel.pairing-requested', (raw) =>
    toPairing(raw as RawPairing)
  ),
  pluginStatusChanged: wsMappedEmitter<{ plugin_id: string; status: IChannelPluginStatus }>(
    'channel.plugin-status-changed',
    (raw) => {
      const r = raw as Record<string, unknown>;
      return {
        plugin_id: r.plugin_id as string,
        status: toPluginStatus(r.status as RawPluginStatus),
      };
    }
  ),
  userAuthorized: wsMappedEmitter<IChannelUser>('channel.user-authorized', (raw) => toChannelUser(raw as RawUser)),
};

// ---------------------------------------------------------------------------
// Team mode
// ---------------------------------------------------------------------------

export const team = {
  create: withResponseMap(
    httpPost<TTeam, ICreateTeamParams>('/api/teams', (p) => ({
      name: p.name,
      agents: p.agents.map(toBackendAgent),
      ...(p.workspace ? { workspace: p.workspace } : {}),
    })),
    fromBackendTeam
  ),
  list: withResponseMap(
    httpGet<TTeam[], { user_id: string }>((p) => `/api/teams?user_id=${encodeURIComponent(p.user_id)}`),
    fromBackendTeamList
  ),
  get: withResponseMap(
    httpGet<TTeam | null, { id: string }>((p) => `/api/teams/${p.id}`),
    fromBackendTeamOptional
  ),
  remove: httpDelete<void, { id: string }>((p) => `/api/teams/${p.id}`),
  addAgent: withResponseMap(
    httpPost<TeamAgent, IAddTeamAgentParams>(
      (p) => `/api/teams/${p.team_id}/agents`,
      (p) => toBackendAgent(p.agent)
    ),
    fromBackendAgent
  ),
  removeAgent: httpDelete<void, { team_id: string; slot_id: string }>(
    (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}`
  ),
  stop: httpDelete<void, { team_id: string }>((p) => `/api/teams/${p.team_id}/session`),
  ensureSession: httpPost<void, { team_id: string }>((p) => `/api/teams/${p.team_id}/session`),
  renameAgent: httpPatch<void, { team_id: string; slot_id: string; new_name: string }>(
    (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}/name`,
    (p) => ({ name: p.new_name })
  ),
  renameTeam: httpPatch<void, { id: string; name: string }>(
    (p) => `/api/teams/${p.id}/name`,
    (p) => ({ name: p.name })
  ),
  setSessionMode: httpPost<void, { team_id: string; session_mode: string }>(
    (p) => `/api/teams/${p.team_id}/session-mode`,
    (p) => ({ session_mode: p.session_mode })
  ),
  agentStatusChanged: wsEmitter<ITeamAgentStatusEvent>('team.agent.status'),
  agentSpawned: wsEmitter<ITeamAgentSpawnedEvent>('team.agent.spawned'),
  agentRemoved: wsEmitter<ITeamAgentRemovedEvent>('team.agent.removed'),
  agentRenamed: wsEmitter<ITeamAgentRenamedEvent>('team.agent.renamed'),
  listChanged: wsEmitter<ITeamListChangedEvent>('team.list-changed'),
  created: wsEmitter<ITeamCreatedEvent>('team.created'),
  teammateMessage: wsEmitter<ITeamTeammateMessageEvent>('team.teammate.message'),
};

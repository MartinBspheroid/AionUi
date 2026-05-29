/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent bridge — assistants CRUD, ACP/OpenClaw conversation adapters, the MCP
 * service, remote agents, and the agent hub.
 */

import type {
  Assistant,
  CreateAssistantRequest,
  ImportAssistantsRequest,
  ImportAssistantsResult,
  SetAssistantStateRequest,
  UpdateAssistantRequest,
} from '@/common/types/agent/assistantTypes';
import type { HubExtensionStatus, IHubAgentItem } from '@/common/types/agent/hub';
import type { IMcpServer } from '@/common/config/storage';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import type {
  HermesCapabilities,
  HermesCheckpoint,
  HermesCliConfigResponse,
  HermesCliRunResponse,
  HermesCronCliResponse,
  HermesCronJobEdit,
  HermesCronJobInput,
  HermesCronJobsResponse,
  HermesMemoryPayload,
  HermesMemoryUpdate,
  HermesSessionsResponse,
  HermesSkillDetail,
  HermesSkillsResponse,
} from '@/common/types/hermes/hermesExt';
import { httpDelete, httpGet, httpPatch, httpPost, httpPut, wsEmitter } from '@/common/adapter/httpBridge';
import { conversation } from './conversation';

export const assistants = {
  list: httpGet<Assistant[], void>('/api/assistants'),
  create: httpPost<Assistant, CreateAssistantRequest>('/api/assistants'),
  update: httpPut<Assistant, UpdateAssistantRequest>((p) => `/api/assistants/${p.id}`),
  delete: httpDelete<void, { id: string }>((p) => `/api/assistants/${p.id}`),
  setState: httpPatch<Assistant, SetAssistantStateRequest>(
    (p) => `/api/assistants/${p.id}/state`,
    (p) => {
      const { id: _id, ...body } = p;
      return body;
    }
  ),
  import: httpPost<ImportAssistantsResult, ImportAssistantsRequest>('/api/assistants/import'),
};

export const acpConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
  getAvailableAgents: httpGet<AgentMetadata[], void>('/api/agents'),
  refreshCustomAgents: httpPost<void, void>('/api/agents/refresh'),
  testCustomAgent: httpPost<
    { step: 'success' } | { step: 'fail_cli'; error: string } | { step: 'fail_acp'; error: string },
    { command: string; acp_args?: string[]; env?: Record<string, string> }
  >('/api/agents/custom/try-connect'),
  createCustomAgent: httpPost<
    AgentMetadata,
    {
      name: string;
      command: string;
      icon?: string;
      args?: string[];
      env?: Array<{ name: string; value: string; description?: string }>;
      advanced?: {
        yolo_id?: string;
        native_skills_dirs?: string[];
        behavior_policy?: { supports_side_question?: boolean };
        description?: string;
      };
    }
  >('/api/agents/custom'),
  updateCustomAgent: httpPut<
    AgentMetadata,
    {
      id: string;
      name: string;
      command: string;
      icon?: string;
      args?: string[];
      env?: Array<{ name: string; value: string; description?: string }>;
      advanced?: {
        yolo_id?: string;
        native_skills_dirs?: string[];
        behavior_policy?: { supports_side_question?: boolean };
        description?: string;
      };
    }
  >(
    (p) => `/api/agents/custom/${p.id}`,
    (p) => {
      const { id: _id, ...rest } = p;
      return rest;
    }
  ),
  deleteCustomAgent: httpDelete<{ deleted: boolean }, { id: string }>((p) => `/api/agents/custom/${p.id}`),
  setAgentEnabled: httpPatch<AgentMetadata, { id: string; enabled: boolean }>(
    (p) => `/api/agents/${p.id}/enabled`,
    (p) => ({ enabled: p.enabled })
  ),
  checkAgentHealth: httpPost<{ available: boolean; latency?: number; error?: string }, { backend: string }>(
    '/api/agents/health-check'
  ),
  setMode: httpPut<void, { conversation_id: string; mode: string }>(
    (p) => `/api/conversations/${p.conversation_id}/mode`,
    (p) => ({ mode: p.mode })
  ),
  // 404 is the expected pre-warmup response from `/api/conversations/:id/mode`
  // and `/api/conversations/:id/model` — the agent has not attached yet, so
  // we have nothing to read. AcpModeSelector / AcpModelSelector both fall back
  // to handshake metadata in that case. Silence the bridge log so this
  // ordinary state doesn't pollute Sentry breadcrumbs (ELECTRON-1BT).
  getMode: httpGet<{ mode: string; initialized: boolean }, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/mode`,
    { silentStatuses: [404] }
  ),
  getModel: httpGet<{ model_info: AcpModelInfo | null }, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/model`,
    { silentStatuses: [404] }
  ),
  setModel: httpPut<void, { conversation_id: string; model_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/model`,
    (p) => ({ model_id: p.model_id })
  ),

  /** Hermes-specific extensions — all silently unsupported (404) when the active
   *  agent is not Hermes or the aioncore version does not expose the endpoint. */
  hermesExt: {
    getMemory: httpGet<HermesMemoryPayload, void>('/api/agents/hermes/memory', { silentStatuses: [404] }),
    setMemory: httpPut<void, HermesMemoryUpdate>('/api/agents/hermes/memory'),
    listSessions: httpGet<HermesSessionsResponse, void>('/api/agents/hermes/sessions?limit=20', {
      silentStatuses: [404],
    }),
    listCronJobs: httpGet<HermesCronJobsResponse, void>('/api/agents/hermes/cron/jobs?limit=100', {
      silentStatuses: [404],
    }),
    createCronJob: httpPost<HermesCronCliResponse, HermesCronJobInput>('/api/agents/hermes/cron/jobs'),
    updateCronJob: httpPatch<HermesCronCliResponse, { id: string; patch: HermesCronJobEdit }>(
      (p) => `/api/agents/hermes/cron/jobs/${encodeURIComponent(p.id)}`,
      (p) => p.patch
    ),
    deleteCronJob: httpDelete<HermesCronCliResponse, { id: string }>(
      (p) => `/api/agents/hermes/cron/jobs/${encodeURIComponent(p.id)}`
    ),
    runCronJob: httpPost<HermesCronCliResponse, { id: string }>(
      (p) => `/api/agents/hermes/cron/jobs/${encodeURIComponent(p.id)}/run`
    ),
    pauseCronJob: httpPost<HermesCronCliResponse, { id: string }>(
      (p) => `/api/agents/hermes/cron/jobs/${encodeURIComponent(p.id)}/pause`
    ),
    resumeCronJob: httpPost<HermesCronCliResponse, { id: string }>(
      (p) => `/api/agents/hermes/cron/jobs/${encodeURIComponent(p.id)}/resume`
    ),
    listSkills: httpGet<HermesSkillsResponse, void>('/api/agents/hermes/skills', { silentStatuses: [404] }),
    getSkill: httpGet<HermesSkillDetail, { id: string }>(
      (p) => `/api/agents/hermes/skills?id=${encodeURIComponent(p.id)}`,
      { silentStatuses: [404] }
    ),
    getCliConfig: httpGet<HermesCliConfigResponse, void>('/api/agents/hermes/cli-config', { silentStatuses: [404] }),
    runCliCommand: httpPost<HermesCliRunResponse, { command_id: string }>('/api/agents/hermes/cli-config'),
    getCapabilities: httpGet<HermesCapabilities, { conversation_id: string }>(
      (p) => `/api/conversations/${p.conversation_id}/hermes/capabilities`,
      { silentStatuses: [404] }
    ),
    compress: httpPost<void, { conversation_id: string; focus?: string }>(
      (p) => `/api/conversations/${p.conversation_id}/hermes/compress`,
      (p) => ({ focus: p.focus })
    ),
    retry: httpPost<void, { conversation_id: string }>((p) => `/api/conversations/${p.conversation_id}/hermes/retry`),
    undo: httpPost<void, { conversation_id: string }>((p) => `/api/conversations/${p.conversation_id}/hermes/undo`),
    forkSession: httpPost<{ session_id: string }, { conversation_id: string }>(
      (p) => `/api/conversations/${p.conversation_id}/hermes/fork`
    ),
    listCheckpoints: httpGet<HermesCheckpoint[], { conversation_id: string }>(
      (p) => `/api/conversations/${p.conversation_id}/hermes/checkpoints`,
      { silentStatuses: [404] }
    ),
    restoreCheckpoint: httpPost<void, { conversation_id: string; checkpoint_id: string }>(
      (p) => `/api/conversations/${p.conversation_id}/hermes/checkpoints/${encodeURIComponent(p.checkpoint_id)}/restore`
    ),
  },
};

export const openclawConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
  getRuntime: httpGet<
    {
      conversation_id: string;
      runtime: {
        workspace?: string;
        backend?: string;
        agent_name?: string;
        cli_path?: string;
        model?: string;
        session_key?: string | null;
        is_connected?: boolean;
        has_active_session?: boolean;
        identity_hash?: string | null;
      };
      expected?: {
        expected_workspace?: string;
        expected_backend?: string;
        expected_agent_name?: string;
        expected_cli_path?: string;
        expected_model?: string;
        expected_identity_hash?: string | null;
        switched_at?: number;
      };
    },
    { conversation_id: string }
  >((p) => `/api/conversations/${p.conversation_id}/openclaw/runtime`),
};

export const mcpService = {
  listServers: httpGet<IMcpServer[], void>('/api/mcp/servers'),
  createServer: httpPost<
    IMcpServer,
    Omit<IMcpServer, 'id' | 'created_at' | 'updated_at' | 'status' | 'last_connected' | 'tools'>
  >('/api/mcp/servers', (server) => ({
    name: server.name,
    description: server.description,
    transport: server.transport,
    original_json: server.original_json,
    builtin: server.builtin,
  })),
  updateServer: httpPut<
    IMcpServer,
    { id: string; data: Partial<Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json'>> }
  >(
    (p) => `/api/mcp/servers/${p.id}`,
    (p) => p.data
  ),
  deleteServer: httpDelete<void, string>((id) => `/api/mcp/servers/${id}`),
  toggleServer: httpPost<IMcpServer, string>(
    (id) => `/api/mcp/servers/${id}/toggle`,
    () => undefined
  ),
  batchImportServers: httpPost<
    IMcpServer[],
    { servers: Array<Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>> }
  >('/api/mcp/servers/import'),
  getAgentMcpConfigs: httpGet<
    Array<{ source: string; servers: IMcpServer[] }>,
    Array<{ agent_type: string; backend?: string; name: string; cli_path?: string }>
  >('/api/mcp/agent-configs'),
  testMcpConnection: httpPost<
    {
      success: boolean;
      tools?: Array<{ name: string; description?: string; _meta?: Record<string, unknown> }>;
      error?: string;
      needsAuth?: boolean;
      authMethod?: 'oauth' | 'basic';
      wwwAuthenticate?: string;
    },
    IMcpServer
  >('/api/mcp/test-connection'),
  syncMcpToAgents: httpPost<
    { success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> },
    { servers: string[] }
  >('/api/mcp/sync-to-agents'),
  removeMcpFromAgents: httpPost<
    { success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> },
    { server_names: string[] }
  >('/api/mcp/remove-from-agents'),
  checkOAuthStatus: httpPost<{ isAuthenticated: boolean; needsLogin: boolean; error?: string }, IMcpServer>(
    '/api/mcp/oauth/check-status'
  ),
  loginMcpOAuth: httpPost<{ success: boolean; error?: string }, { server: IMcpServer; config?: unknown }>(
    '/api/mcp/oauth/login'
  ),
  logoutMcpOAuth: httpPost<void, string>('/api/mcp/oauth/logout', (serverName) => ({ serverName })),
  getAuthenticatedServers: httpGet<string[], void>('/api/mcp/oauth/authenticated'),
};

export const remoteAgent = {
  list: httpGet<import('@/common/types/agent/remoteAgentTypes').RemoteAgentConfig[], void>('/api/remote-agents'),
  get: httpGet<import('@/common/types/agent/remoteAgentTypes').RemoteAgentConfig | null, { id: string }>(
    (p) => `/api/remote-agents/${p.id}`
  ),
  create: httpPost<
    import('@/common/types/agent/remoteAgentTypes').RemoteAgentConfig,
    import('@/common/types/agent/remoteAgentTypes').RemoteAgentInput
  >('/api/remote-agents'),
  update: httpPut<
    boolean,
    { id: string; updates: Partial<import('@/common/types/agent/remoteAgentTypes').RemoteAgentInput> }
  >(
    (p) => `/api/remote-agents/${p.id}`,
    (p) => p.updates
  ),
  delete: httpDelete<boolean, { id: string }>((p) => `/api/remote-agents/${p.id}`),
  testConnection: httpPost<
    { success: boolean; error?: string },
    { url: string; auth_type: string; auth_token?: string; allow_insecure?: boolean }
  >('/api/remote-agents/test-connection'),
  handshake: httpPost<{ status: 'ok' | 'pending_approval' | 'error'; error?: string }, { id: string }>(
    (p) => `/api/remote-agents/${p.id}/handshake`
  ),
};

export const hub = {
  getExtensionList: httpGet<IHubAgentItem[], void>('/api/hub/extensions'),
  install: httpPost<void, { name: string }>('/api/hub/install'),
  uninstall: httpPost<void, { name: string }>('/api/hub/uninstall'),
  retryInstall: httpPost<void, { name: string }>('/api/hub/retry-install'),
  checkUpdates: httpPost<{ name: string }[], void>('/api/hub/check-updates'),
  update: httpPost<void, { name: string }>('/api/hub/update'),
  onStateChanged: wsEmitter<{ name: string; status: HubExtensionStatus; error?: string }>('hub.state-changed'),
};

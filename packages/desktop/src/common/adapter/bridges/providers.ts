/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider bridge — LLM provider management (/api/providers), Bedrock and
 * Google connection checks, and the stubbed Electron-native Google OAuth.
 */

import type { IProvider } from '@/common/config/storage';
import type {
  CreateProviderRequest,
  FetchModelsAnonymousRequest,
  FetchModelsResponse,
  UpdateProviderRequest,
} from '@/common/types/provider/providerApi';
import type { ProtocolDetectionRequest, ProtocolDetectionResponse } from '@/common/utils/protocolDetector';
import { httpDelete, httpGet, httpPost, httpPut, stubProvider } from '@/common/adapter/httpBridge';
import type { IBridgeResponse } from './shared';

export const mode = {
  listProviders: httpGet<IProvider[], void>('/api/providers'),
  createProvider: httpPost<IProvider, CreateProviderRequest>('/api/providers'),
  updateProvider: httpPut<IProvider, { id: string } & UpdateProviderRequest>(
    (p) => `/api/providers/${p.id}`,
    (p) => {
      const { id: _id, ...body } = p;
      return body;
    }
  ),
  deleteProvider: httpDelete<void, { id: string }>((p) => `/api/providers/${p.id}`),
  fetchProviderModels: httpPost<FetchModelsResponse, { id: string; try_fix?: boolean }>(
    (p) => `/api/providers/${p.id}/models`,
    (p) => ({ try_fix: p.try_fix })
  ),
  /**
   * Pre-create form preview — anonymous fetch-models (T1b).
   * Takes credentials in the body, no provider row required. Used by
   * AddPlatformModal / EditModeModal / ApiKeyEditorModal while the
   * dropdown is still being populated.
   */
  fetchModelList: httpPost<FetchModelsResponse, FetchModelsAnonymousRequest>('/api/providers/fetch-models'),
  detectProtocol: httpPost<ProtocolDetectionResponse, ProtocolDetectionRequest>('/api/providers/detect-protocol'),
};

export const bedrock = {
  testConnection: httpPost<
    { msg?: string },
    {
      bedrock_config: {
        auth_method: 'accessKey' | 'profile';
        region: string;
        access_key_id?: string;
        secret_access_key?: string;
        profile?: string;
      };
    }
  >('/api/bedrock/test-connection'),
};

export const google = {
  subscriptionStatus: httpGet<
    { isSubscriber: boolean; tier?: string; lastChecked: number; message?: string },
    { proxy?: string }
  >('/api/google/subscription-status'),
};

export const googleAuth = {
  status: stubProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('googleAuth.status', {
    success: false,
    msg: 'Google Auth not available in backend mode',
  }),
};

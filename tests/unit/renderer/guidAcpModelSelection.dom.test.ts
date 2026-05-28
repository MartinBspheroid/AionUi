import { describe, expect, it } from 'vitest';
import { resolveSelectedAcpModel } from '@/renderer/pages/guid/hooks/useGuidAgentSelection';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';

const hermesAgents: AgentMetadata[] = [
  {
    id: 'hermes-row',
    name: 'Hermes',
    backend: 'hermes',
    agent_type: 'acp',
    agent_source: 'builtin',
    enabled: true,
    available: true,
    handshake: {
      available_models: {
        current_model_id: 'openai-codex:gpt-5.3-codex-spark',
        current_model_label: 'gpt-5.3-codex-spark',
        available_models: [
          { id: 'openai-codex:gpt-5.5', label: 'gpt-5.5' },
          { id: 'openai-codex:gpt-5.3-codex-spark', label: 'gpt-5.3-codex-spark' },
        ],
      },
    },
  },
];

describe('resolveSelectedAcpModel', () => {
  it('falls back to the Hermes handshake current model when a saved preference is stale', () => {
    expect(
      resolveSelectedAcpModel(
        'hermes',
        { hermes: { preferredModelId: 'openai-codex:gpt-5.4' } },
        hermesAgents
      )
    ).toBe('openai-codex:gpt-5.3-codex-spark');
  });

  it('keeps a saved Hermes preference when the advertised catalog still contains it', () => {
    expect(
      resolveSelectedAcpModel(
        'hermes',
        { hermes: { preferredModelId: 'openai-codex:gpt-5.5' } },
        hermesAgents
      )
    ).toBe('openai-codex:gpt-5.5');
  });

  it('uses the Hermes handshake current model when no saved preference exists', () => {
    expect(resolveSelectedAcpModel('hermes', {}, hermesAgents)).toBe('openai-codex:gpt-5.3-codex-spark');
  });

  it('preserves a preference when no concrete model catalog is known yet', () => {
    expect(
      resolveSelectedAcpModel(
        'hermes',
        { hermes: { preferredModelId: 'openai-codex:gpt-5.4' } },
        [
          {
            ...hermesAgents[0],
            handshake: undefined,
          },
        ]
      )
    ).toBe('openai-codex:gpt-5.4');
  });
});

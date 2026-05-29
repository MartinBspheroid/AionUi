/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Appends a "(provider)" suffix to any model whose display label is shared by
 * at least one other model in the list. Fixes hermes-webui #1425.
 *
 * @param models     - Array of model objects of generic type T.
 * @param getLabel   - Extracts the current display label from a model.
 * @param getProvider - Extracts the provider name from a model.
 * @param setLabel   - Returns a new model object with the updated label applied.
 * @returns A new array where duplicate labels are disambiguated.
 */
export function disambiguateModelLabels<T>(
  models: T[],
  getLabel: (model: T) => string,
  getProvider: (model: T) => string,
  setLabel: (model: T, label: string) => T
): T[] {
  const labelCounts = new Map<string, number>();

  for (const model of models) {
    const label = getLabel(model);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  return models.map((model) => {
    const label = getLabel(model);
    if ((labelCounts.get(label) ?? 0) > 1) {
      const provider = getProvider(model);
      return setLabel(model, `${label} (${provider})`);
    }
    return model;
  });
}

/**
 * Returns true when the given model ID targets the OpenRouter free tier, i.e.
 * when the ID ends with the ':free' suffix.
 */
export function isOpenRouterFreeTier(modelId: string): boolean {
  return modelId.endsWith(':free');
}

/**
 * Creates a predicate that filters model IDs based on whether the free tier
 * should be included.
 *
 * @param includeFreeTier - When false, free-tier models are excluded.
 * @returns A function that returns true when the model should be kept.
 */
export function makeModelFilter(includeFreeTier: boolean): (modelId: string) => boolean {
  return (modelId: string) => {
    if (!includeFreeTier && isOpenRouterFreeTier(modelId)) {
      return false;
    }
    return true;
  };
}

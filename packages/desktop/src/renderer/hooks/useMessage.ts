/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from '@arco-design/web-react';
import type { MessageHookReturnType } from '@arco-design/web-react/es/Message/interface';

/**
 * Arco's `Message.useMessage()` types every method (`info`/`success`/`warning`/
 * `error`/`normal`) as OPTIONAL, even though they always exist at runtime. Under
 * `strictNullChecks` that makes every `message.warning(...)` call a TS2722
 * ("cannot invoke possibly-undefined") error.
 *
 * Use this wrapper instead of `Message.useMessage` directly so the instance is
 * typed with non-optional methods. For prop/field typing use {@link MessageInstance}.
 */
export type MessageInstance = Required<MessageHookReturnType>;

type UseMessageConfig = Parameters<typeof Message.useMessage>[0];
type ContextHolder = ReturnType<typeof Message.useMessage>[1];

export function useMessage(config?: UseMessageConfig): [MessageInstance, ContextHolder] {
  const [instance, holder] = Message.useMessage(config);
  return [instance as MessageInstance, holder];
}

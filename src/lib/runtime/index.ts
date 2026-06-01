/**
 * runtime/index.ts — Initialize and register all agent runtimes.
 *
 * Import this module once at app startup to make runtimes available
 * via resolveRuntime().
 */

export type { AgentRuntime, RuntimeStreamOptions } from './types';
export { registerRuntime, getRuntime, getAllRuntimes, getAvailableRuntimes, resolveRuntime, predictNativeRuntime } from './registry';

import { registerRuntime } from './registry';
import { nativeRuntime } from './native-runtime';
import { sdkRuntime } from './sdk-runtime';

// Register built-in runtimes
registerRuntime(nativeRuntime);
registerRuntime(sdkRuntime);

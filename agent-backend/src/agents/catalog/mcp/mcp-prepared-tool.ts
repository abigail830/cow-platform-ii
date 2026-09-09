// @flue/runtime does not export prepared-tool helpers; load from the runtime bundle chunk (version-locked).
import {
  S as registerPreparedToolAdapter,
  x as getPreparedToolAdapter,
} from '../../../../node_modules/@flue/runtime/dist/skill-package-B-Co0HMC.mjs';

export { getPreparedToolAdapter, registerPreparedToolAdapter };

export type McpPreparedToolAdapter = {
  parameters?: Record<string, unknown>;
  execute: (args: unknown, signal?: AbortSignal) => Promise<string>;
};

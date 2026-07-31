import { z } from 'zod';
import {
  DEFAULT_OKF_BUNDLE_ENV_REF,
  parseOkfBundleRef,
  type OkfBundleRef,
} from '../shared/okf-bundle-ref.ts';

const okfBundleRefSchema = z.string().min(1).transform(parseOkfBundleRef);

const okfToolPackSchema = z.object({
  name: z.literal('okf'),
  bundle: okfBundleRefSchema,
});

const toolPackRefSchema = z.union([
  z.string().min(1),
  okfToolPackSchema,
]);

export type OkfToolPackConfig = {
  name: 'okf';
  bundle: OkfBundleRef;
};

export type NormalizedToolPackRef = { name: string } | OkfToolPackConfig;

export function normalizeToolPackRef(ref: string): NormalizedToolPackRef {
  if (ref === 'okf') {
    return { name: 'okf', bundle: parseOkfBundleRef(DEFAULT_OKF_BUNDLE_ENV_REF) };
  }
  return { name: ref };
}

export function isOkfToolPack(pack: NormalizedToolPackRef): pack is OkfToolPackConfig {
  return pack.name === 'okf';
}

export const toolPacksSchema = z
  .array(toolPackRefSchema)
  .default([])
  .transform((packs) =>
    packs.map((pack) => (typeof pack === 'string' ? normalizeToolPackRef(pack) : pack)),
  );

export { DEFAULT_OKF_BUNDLE_ENV_REF, type OkfBundleRef } from '../shared/okf-bundle-ref.ts';

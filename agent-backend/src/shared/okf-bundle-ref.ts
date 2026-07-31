const ENV_BUNDLE_REF_RE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

export const DEFAULT_OKF_BUNDLE_ENV_REF = '${OKF_BUNDLE_PATH}';

export type OkfBundleRef =
  | { kind: 'env'; envVar: string }
  | { kind: 'path'; path: string };

/** Parse `bundle` values like `${OKF_BUNDLE_PATH}` (env) or `/path/to/bundle` (literal). */
export function parseOkfBundleRef(value: string): OkfBundleRef {
  const trimmed = value.trim();
  const envMatch = trimmed.match(ENV_BUNDLE_REF_RE);
  if (envMatch) {
    return { kind: 'env', envVar: envMatch[1] };
  }
  return { kind: 'path', path: trimmed };
}

export function formatOkfBundleRef(bundle: OkfBundleRef): string {
  return bundle.kind === 'env' ? `\${${bundle.envVar}}` : bundle.path;
}

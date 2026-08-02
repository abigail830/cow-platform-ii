/** Shared HTTP client for openkms-skill Node scripts. */

export class OpenKmsClientError extends Error {
  /** @param {string} message */
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'OpenKmsClientError';
    this.status = status ?? null;
  }
}

function apiUrl() {
  const url = String(process.env.OPENKMS_API_URL ?? 'http://127.0.0.1:8787')
    .trim()
    .replace(/\/$/, '');
  if (!url) throw new OpenKmsClientError('OPENKMS_API_URL is not set');
  return url;
}

function apiKey() {
  const key = String(process.env.OPENKMS_API_KEY ?? '').trim();
  if (!key) {
    throw new OpenKmsClientError(
      'OPENKMS_API_KEY is not set. Generate a key in Settings → API keys and set it in the host environment.',
    );
  }
  return key;
}

/**
 * @param {string} method
 * @param {string} path
 * @param {{ body?: Record<string, unknown> }} [options]
 */
export async function requestJson(method, path, { body } = {}) {
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: 'application/json',
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  /** @type {unknown} */
  let parsed = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String(parsed.error)
        : text || res.statusText;
    if (res.status === 401) {
      throw new OpenKmsClientError(
        `Unauthorized (${message}). Check OPENKMS_API_KEY is valid and not revoked.`,
        { status: 401 },
      );
    }
    if (res.status === 403) {
      throw new OpenKmsClientError(
        `Forbidden (${message}). Check RBAC and knowledge-base ACL.`,
        { status: 403 },
      );
    }
    throw new OpenKmsClientError(`HTTP ${res.status}: ${message}`, { status: res.status });
  }

  return parsed;
}

/** @param {unknown} exc */
export function eprintError(exc) {
  const message = exc instanceof Error ? exc.message : String(exc);
  console.error(message);
}

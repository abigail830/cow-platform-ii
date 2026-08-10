import type { MiddlewareHandler } from 'hono';

/**
 * Flue serves agent attachments with `Content-Security-Policy: sandbox` (no allow-scripts).
 * HTML slide decks (reveal.js + CDN assets) need scripts — relax CSP for text/html only.
 */
const HTML_ARTIFACT_CSP = [
  "default-src 'none'",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: https:",
  "connect-src 'self'",
].join('; ');

const ATTACHMENT_PATH_RE = /\/attachments\/[^/]+$/;

function isHtmlAttachmentContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return lower.includes('text/html') || lower.includes('application/xhtml');
}

export const fixAgentAttachmentResponseHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  const pathname = c.req.path;
  if (!ATTACHMENT_PATH_RE.test(pathname)) return;
  if (c.res.status !== 200) return;

  const contentType = c.res.headers.get('content-type') ?? '';
  if (!isHtmlAttachmentContentType(contentType)) return;

  c.res.headers.set('content-security-policy', HTML_ARTIFACT_CSP);
};

import { parseDocumentDeepLink } from './document-deep-link.ts';

export type SourcePreviewTarget = {
  documentId: string;
  page: number | null;
};

const DOCUMENT_PATH_RE = /^\/knowledge\/documents\/([^/?#]+)$/;

export function isExternalHttpUrl(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

/** Parse in-app document original-preview URLs for inline viewer hosts. */
export function parseSourcePreviewHref(href: string): SourcePreviewTarget | null {
  const trimmed = href.trim();
  if (!trimmed || isExternalHttpUrl(trimmed)) return null;

  let pathname: string;
  let search: string;

  try {
    if (trimmed.startsWith('/')) {
      const queryIndex = trimmed.indexOf('?');
      pathname = queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed;
      search = queryIndex >= 0 ? trimmed.slice(queryIndex) : '';
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const match = pathname.match(DOCUMENT_PATH_RE);
  if (!match?.[1]) return null;

  const deepLink = parseDocumentDeepLink(search);
  if (deepLink.view === 'parsed') return null;

  return {
    documentId: match[1],
    page: deepLink.page,
  };
}

import { createDrizzlePageIndexItemStore } from './adapters/drizzle-item-store.ts';
import type { PageIndexSearchDeps } from './ports.ts';
import { createPageIndexSearchService, defaultReadMarkdownFromStorage } from './service.ts';

export function createDefaultPageIndexSearchDeps(): PageIndexSearchDeps {
  return {
    itemStore: createDrizzlePageIndexItemStore(),
    readMarkdownFromStorage: defaultReadMarkdownFromStorage,
  };
}

export function createDefaultPageIndexSearchService() {
  return createPageIndexSearchService(createDefaultPageIndexSearchDeps());
}

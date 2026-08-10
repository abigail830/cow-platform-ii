import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_STORAGE_PREFIX = 'okf:chunk-reload:';

/**
 * Like React.lazy, but reloads the page once when a dynamic import fails — usually
 * a stale tab after a new deployment where hashed chunk files no longer exist.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  importId: string,
): LazyExoticComponent<T> {
  const load = async (): Promise<{ default: T }> => {
    try {
      return await factory();
    } catch (error) {
      const reloadKey = `${CHUNK_RELOAD_STORAGE_PREFIX}${importId}`;
      const hasReloaded = sessionStorage.getItem(reloadKey);

      if (!hasReloaded) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }

      sessionStorage.removeItem(reloadKey);
      throw error;
    }
  };

  return lazy(load);
}

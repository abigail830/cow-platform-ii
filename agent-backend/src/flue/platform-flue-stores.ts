import type { AttachmentStore } from '@flue/runtime/adapter';
import type { ConversationStreamStore } from '@flue/runtime/adapter';
import db from '../db.ts';

export type PlatformFlueStores = {
  attachmentStore: AttachmentStore;
  conversationStreamStore: ConversationStreamStore;
};

let cachedStores: PlatformFlueStores | undefined;
let connectPromise: Promise<PlatformFlueStores> | undefined;

export function setPlatformFlueStores(stores: PlatformFlueStores): void {
  cachedStores = stores;
}

export async function getPlatformFlueStores(): Promise<PlatformFlueStores> {
  if (cachedStores) return cachedStores;
  if (!connectPromise) {
    connectPromise = (async () => {
      const persistence = db as {
        connect: () => Promise<{
          attachmentStore: AttachmentStore;
          conversationStreamStore: ConversationStreamStore;
        }>;
      };
      const connected = await persistence.connect();
      if (!connected?.attachmentStore || !connected.conversationStreamStore) {
        throw new Error(
          '[flue] persistence.connect() must return attachmentStore and conversationStreamStore',
        );
      }
      cachedStores = {
        attachmentStore: connected.attachmentStore,
        conversationStreamStore: connected.conversationStreamStore,
      };
      return cachedStores;
    })();
  }
  return connectPromise;
}

export function resetPlatformFlueStoresForTests(): void {
  cachedStores = undefined;
  connectPromise = undefined;
}

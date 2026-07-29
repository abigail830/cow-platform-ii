import { createContext, useContext, type ReactNode } from 'react';
import type { DocumentChannel } from '../api/documentChannels.ts';

export type DocumentsOutletContext = {
  channels: DocumentChannel[];
  selectedChannelId: string | null;
  setSelectedChannelId: (id: string | null) => void;
  canWrite: boolean;
  loadingChannels: boolean;
  loadChannels: () => Promise<void>;
  openCreateChannel: (parentId: string | null) => void;
  openChannelSettings: (channel: DocumentChannel) => void;
};

const DocumentsOutletContextInternal = createContext<DocumentsOutletContext | null>(null);

export function DocumentsOutletProvider({
  value,
  children,
}: {
  value: DocumentsOutletContext;
  children: ReactNode;
}) {
  return <DocumentsOutletContextInternal.Provider value={value}>{children}</DocumentsOutletContextInternal.Provider>;
}

export function useDocumentsOutletContext(): DocumentsOutletContext {
  const ctx = useContext(DocumentsOutletContextInternal);
  if (!ctx) throw new Error('useDocumentsOutletContext must be used within DocumentsLayout');
  return ctx;
}

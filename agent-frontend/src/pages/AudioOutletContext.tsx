import { createContext, useContext, type ReactNode } from 'react';
import type { AudioChannel } from '../api/audioChannels.ts';

export type AudioOutletContext = {
  channels: AudioChannel[];
  selectedChannelId: string | null;
  setSelectedChannelId: (id: string | null) => void;
  canWrite: boolean;
  loadingChannels: boolean;
  loadChannels: () => Promise<void>;
  openCreateChannel: (parentId: string | null) => void;
  openChannelSettings: (channel: AudioChannel) => void;
};

const AudioOutletContextInternal = createContext<AudioOutletContext | null>(null);

export function AudioOutletProvider({
  value,
  children,
}: {
  value: AudioOutletContext;
  children: ReactNode;
}) {
  return <AudioOutletContextInternal.Provider value={value}>{children}</AudioOutletContextInternal.Provider>;
}

export function useAudioOutletContext(): AudioOutletContext {
  const ctx = useContext(AudioOutletContextInternal);
  if (!ctx) throw new Error('useAudioOutletContext must be used within AudioLayout');
  return ctx;
}

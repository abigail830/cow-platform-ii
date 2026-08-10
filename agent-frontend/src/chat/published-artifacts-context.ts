import { createContext, useContext } from 'react';
import type { PublishedArtifact } from './published-artifacts.ts';

export const PublishedArtifactsContext = createContext<PublishedArtifact[]>([]);

export function usePublishedArtifacts(): PublishedArtifact[] {
  return useContext(PublishedArtifactsContext);
}

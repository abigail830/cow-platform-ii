import { createContext, useContext } from 'react';

export const ChatLinkResolveContext = createContext<
  ((href: string, label?: string) => string) | undefined
>(undefined);

export function useChatLinkResolve(): ((href: string, label?: string) => string) | undefined {
  return useContext(ChatLinkResolveContext);
}

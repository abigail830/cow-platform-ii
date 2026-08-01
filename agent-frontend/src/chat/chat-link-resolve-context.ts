import { createContext, useContext } from 'react';

export const ChatLinkResolveContext = createContext<((href: string) => string) | undefined>(
  undefined,
);

export function useChatLinkResolve(): ((href: string) => string) | undefined {
  return useContext(ChatLinkResolveContext);
}

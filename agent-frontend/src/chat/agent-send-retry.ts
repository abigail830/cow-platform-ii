import type { AgentPromptImage } from './prompt-images.ts';

export function isAdmissionRaceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Direct admission disappeared before canonical readiness') ||
    message.includes('Dispatch admission disappeared before canonical readiness')
  );
}

export type AgentSendOptions = {
  images?: AgentPromptImage[];
};

export type AgentSendFn = (message: string, options?: AgentSendOptions) => Promise<void>;

const ADMISSION_RETRY_DELAYS_MS = [400, 900];

export async function sendMessageWithAdmissionRetry(
  send: AgentSendFn,
  message: string,
  options?: AgentSendOptions,
): Promise<void> {
  const attempts = 1 + ADMISSION_RETRY_DELAYS_MS.length;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await send(message, options);
      return;
    } catch (error) {
      const delay = ADMISSION_RETRY_DELAYS_MS[attempt];
      if (!isAdmissionRaceError(error) || delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

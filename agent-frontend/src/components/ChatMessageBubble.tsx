import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { useMemo, type ReactNode } from 'react';
import { ChatLinkResolveContext } from '../chat/chat-link-resolve-context.ts';
import { getCachedPromptImagePreviews } from '../chat/prompt-image-preview-cache.ts';
import { isImageMediaType } from '../chat/prompt-images.ts';
import { parseSessionFilesManifest, stripSessionFilesManifest } from '../chat/session-files.ts';
import { assistantMessageText, userMessageText } from '../chat/groupMessages.ts';
import { extractPublishedArtifacts, buildArtifactHrefResolver, normalizeAttachmentDownloadUrl } from '../chat/published-artifacts.ts';
import { buildKbCitationHrefResolver, extractKbCitations } from '../chat/kb-citations.ts';
import { ChatImageChip } from './ChatImageChip.tsx';
import { SessionFileChip } from './SessionFileChip.tsx';
import { MessageCopyButton } from './MessageCopyButton.tsx';

type UserMessageBubbleProps = {
  message: FlueConversationMessage;
};

type UserFilePart = Extract<FlueConversationPart, { type: 'file' }>;

function userImageParts(message: FlueConversationMessage): UserFilePart[] {
  return message.parts.filter(
    (part): part is UserFilePart => part.type === 'file' && isImageMediaType(part.mediaType),
  );
}

function imagePartLabel(part: UserFilePart, index: number): string {
  const filename = part.filename?.trim();
  if (filename) return filename;
  return `Image ${index + 1}`;
}

export function UserMessageBubble({ message }: UserMessageBubbleProps) {
  const rawText = userMessageText(message);
  const sessionFiles = parseSessionFilesManifest(rawText);
  const text = stripSessionFilesManifest(rawText).trim();
  const images = userImageParts(message);
  const cachedPreviews = useMemo(
    () => getCachedPromptImagePreviews(message.submissionId),
    [message.submissionId],
  );

  return (
    <div className="message-stack user">
      <div className="message user">
        {text ? <p>{text}</p> : null}
        {images.length > 0 ? (
          <div className="user-message-images">
            {images.map((part, index) => {
              const cached = cachedPreviews?.[index];
              const label = cached?.label ?? imagePartLabel(part, index);
              const previewUrl =
                cached?.previewUrl ??
                (part.url ? normalizeAttachmentDownloadUrl(part.url) : null);
              return (
                <ChatImageChip
                  key={`${part.filename ?? 'image'}-${index}`}
                  label={label}
                  previewUrl={previewUrl}
                  variant="message"
                />
              );
            })}
          </div>
        ) : null}
        {sessionFiles.length > 0 ? (
          <div className="user-message-session-files">
            {sessionFiles.map((file) => (
              <SessionFileChip
                key={file.fileId}
                filename={file.filename}
                sizeBytes={file.sizeBytes}
                includedInContext={file.includedInContext}
                variant="message"
              />
            ))}
          </div>
        ) : null}
      </div>
      {text ? <MessageCopyButton text={text} /> : null}
    </div>
  );
}

type AssistantMessageBubbleProps = {
  messages: FlueConversationMessage[];
  children: ReactNode;
  showCopy?: boolean;
};

export function AssistantMessageBubble({
  messages,
  children,
  showCopy = true,
}: AssistantMessageBubbleProps) {
  const text = assistantMessageText(messages);
  const resolveLinkHref = useMemo(() => {
    const artifactResolver = buildArtifactHrefResolver(extractPublishedArtifacts(messages));
    const kbResolver = buildKbCitationHrefResolver(extractKbCitations(messages));
    return (href: string, label?: string) => kbResolver(artifactResolver(href, label), label);
  }, [messages]);

  return (
    <ChatLinkResolveContext.Provider value={resolveLinkHref}>
      <div className="message-stack assistant">
        <div className="message assistant">{children}</div>
        {showCopy ? <MessageCopyButton text={text} /> : null}
      </div>
    </ChatLinkResolveContext.Provider>
  );
}

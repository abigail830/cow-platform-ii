import { useFlueAgent, useFlueClient, type FlueConversationMessage } from '@flue/react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { isAgentBusy } from '../chat/agentStatus.ts';
import { sendMessageWithAdmissionRetry } from '../chat/agent-send-retry.ts';
import { bindPendingPromptImageCache, stagePromptImagesForNextSend } from '../chat/prompt-image-preview-cache.ts';
import { normalizePromptMessage, type AgentPromptImage } from '../chat/prompt-images.ts';
import {
  composerReadySessionFiles,
  hasProcessingSessionFiles,
  messageWithSessionFiles,
  type SessionFile,
} from '../chat/session-files.ts';
import {
  deleteSessionFile as deleteSessionFileApi,
  uploadSessionFile,
} from '../api/session-files.ts';
import { resolveFlueLiveMode } from '../chat/flue-live-mode.ts';
import {
  filterRenderableParts,
  groupConsecutiveMessages,
  isSubmissionStatusMessage,
  lastUserMessage,
  mergeAssistantParts,
  partRenderKey,
  userMessageText,
} from '../chat/groupMessages.ts';
import {
  applyAbortedTurnSnapshots,
  finalizeMessagesForAbortFreeze,
  snapshotAbortedAssistantTurn,
} from '../chat/abort-freeze.ts';
import { isActiveStreaming, shouldShowThinkingIndicator } from '../chat/typing-indicator.ts';
import { isLatestAssistantTurn } from '../chat/assistant-turn.ts';
import { useChatAutoScroll } from '../chat/use-chat-auto-scroll.ts';
import { useThrottledMessages } from '../chat/use-throttled-messages.ts';
import { ChatLinkResolveContext } from '../chat/chat-link-resolve-context.ts';
import {
  buildArtifactHrefResolver,
  extractPublishedArtifacts,
} from '../chat/published-artifacts.ts';
import { PublishedArtifactsContext } from '../chat/published-artifacts-context.ts';
import { buildKbCitationHrefResolver, extractKbCitations } from '../chat/kb-citations.ts';
import { MessagePart } from '../chat/MessagePart.tsx';
import { toAgentInstanceId } from '../shared/agent-instance-id.ts';
import { AssistantMessageBubble, UserMessageBubble } from './ChatMessageBubble.tsx';
import { AssistantInProgress } from './AssistantInProgress.tsx';
import { ChatComposer } from './ChatComposer.tsx';

const FLUE_LIVE_MODE = resolveFlueLiveMode();

type AgentChatPanelProps = {
  agentName: string;
  conversationId: string;
  userId: string;
  initialMessage?: string | null;
  initialImages?: AgentPromptImage[] | null;
  onInitialMessageSent?: () => void;
  onTitleFromMessage?: (title: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  onBusyChange?: (busy: boolean) => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
};

export function AgentChatPanel({
  agentName,
  conversationId,
  userId,
  initialMessage,
  initialImages,
  onInitialMessageSent,
  onTitleFromMessage,
  input,
  onInputChange,
  onBusyChange,
  messagesEndRef,
}: AgentChatPanelProps) {
  const agentInstanceId = useMemo(
    () => toAgentInstanceId(userId, conversationId),
    [userId, conversationId],
  );

  const client = useFlueClient();
  const agent = useFlueAgent({
    name: agentName,
    id: agentInstanceId,
    live: FLUE_LIVE_MODE,
  });

  const [canceling, setCanceling] = useState(false);
  /** Documents staged for the next outgoing message only; cleared after a successful send. */
  const [pendingSessionFiles, setPendingSessionFiles] = useState<SessionFile[]>([]);
  const [abortedSubmissionIds, setAbortedSubmissionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [abortedTurnSnapshots, setAbortedTurnSnapshots] = useState<
    Map<string, FlueConversationMessage[]>
  >(() => new Map());
  /** Full transcript snapshot when abort fires before submissionId is known. */
  const [abortMessageOverride, setAbortMessageOverride] = useState<
    FlueConversationMessage[] | null
  >(null);
  /** Immediate UI suppression while Flue settles abort asynchronously. */
  const [abortUiSuppressed, setAbortUiSuppressed] = useState(false);
  const initialSentRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  function includedSessionFiles(files: SessionFile[]): SessionFile[] {
    return composerReadySessionFiles(files).filter((file) => file.includedInContext);
  }

  function buildModelMessage(userText: string, files: SessionFile[], imageCount = 0): string {
    const included = includedSessionFiles(files);
    const messageForModel = messageWithSessionFiles(userText, included);
    return normalizePromptMessage(messageForModel, imageCount, included.length > 0);
  }

  async function onUploadSessionFiles(files: File[]) {
    for (const file of files) {
      const localId = crypto.randomUUID();
      setPendingSessionFiles((current) => [
        ...current,
        {
          localId,
          fileId: localId,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          includedInContext: true,
          status: 'processing',
        },
      ]);

      try {
        const uploaded = await uploadSessionFile(agentName, agentInstanceId, file);
        setPendingSessionFiles((current) =>
          current.map((item) =>
            item.localId === localId
              ? {
                  localId,
                  fileId: uploaded.fileId,
                  filename: uploaded.filename,
                  mimeType: uploaded.mimeType,
                  sizeBytes: uploaded.sizeBytes,
                  includedInContext: true,
                  status: 'ready' as const,
                }
              : item,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process file.';
        setPendingSessionFiles((current) =>
          current.map((item) =>
            item.localId === localId
              ? { ...item, status: 'error' as const, errorMessage: message }
              : item,
          ),
        );
      }
    }
  }

  async function onRemoveSessionFile(fileId: string, localId?: string) {
    if (fileId.startsWith('sf_')) {
      await deleteSessionFileApi(agentName, agentInstanceId, fileId);
    }
    setPendingSessionFiles((current) =>
      current.filter((file) => file.fileId !== fileId && file.localId !== localId),
    );
  }

  function onToggleSessionFileIncluded(fileId: string) {
    setPendingSessionFiles((current) =>
      current.map((file) =>
        file.fileId === fileId ? { ...file, includedInContext: !file.includedInContext } : file,
      ),
    );
  }

  function clearPendingSessionFilesAfterSend() {
    setPendingSessionFiles([]);
  }

  useEffect(() => {
    initialSentRef.current = false;
    setPendingSessionFiles([]);
    setAbortedSubmissionIds(new Set());
    setAbortedTurnSnapshots(new Map());
    setAbortMessageOverride(null);
    setAbortUiSuppressed(false);
  }, [conversationId, agentInstanceId]);

  const displayMessages = useMemo(
    () =>
      abortMessageOverride ??
      applyAbortedTurnSnapshots(agent.messages, abortedTurnSnapshots),
    [abortMessageOverride, agent.messages, abortedTurnSnapshots],
  );

  const busy = isAgentBusy(agent.status);
  const displayBusy = busy && !abortUiSuppressed;
  const activeStreaming = isActiveStreaming(displayMessages);
  const renderMessages = useThrottledMessages(displayMessages, displayBusy && activeStreaming);
  const rows = useMemo(() => groupConsecutiveMessages(renderMessages), [renderMessages]);
  const showThinking =
    !abortUiSuppressed && shouldShowThinkingIndicator(agent.status, displayMessages);

  const publishedArtifacts = useMemo(
    () => extractPublishedArtifacts(displayMessages),
    [displayMessages],
  );

  const resolveLinkHref = useMemo(() => {
    const artifactResolver = buildArtifactHrefResolver(publishedArtifacts);
    const kbResolver = buildKbCitationHrefResolver(extractKbCitations(displayMessages));
    return (href: string, label?: string) => kbResolver(artifactResolver(href, label), label);
  }, [publishedArtifacts, displayMessages]);

  useChatAutoScroll(
    messagesContainerRef,
    [renderMessages, showThinking, agent.error],
    displayBusy,
  );

  useEffect(() => {
    onBusyChange?.(displayBusy);
  }, [displayBusy, onBusyChange]);

  useEffect(() => {
    if (!displayBusy) setCanceling(false);
  }, [displayBusy]);

  useEffect(() => {
    if (!busy) setAbortUiSuppressed(false);
  }, [busy]);

  useEffect(() => {
    bindPendingPromptImageCache(agent.messages);
  }, [agent.messages]);

  useEffect(() => {
    const images = initialImages ?? [];
    const message = buildModelMessage(initialMessage ?? '', pendingSessionFiles, images.length);
    if (!message && images.length === 0) return;
    if (initialSentRef.current || !agent.historyReady) return;
    initialSentRef.current = true;
    const sendOptions = images.length > 0 ? { images } : undefined;
    if (images.length > 0) stagePromptImagesForNextSend(images);
    void sendMessageWithAdmissionRetry((m, opts) => agent.sendMessage(m, opts), message, sendOptions)
      .then(() => {
        clearPendingSessionFilesAfterSend();
        const titleSource = initialMessage?.trim() || (images.length > 0 ? 'Image' : '');
        if (titleSource) onTitleFromMessage?.(titleSource.slice(0, 48));
        onInitialMessageSent?.();
      })
      .catch((err) => console.error('[chat] initial send failed', err));
  }, [
    initialMessage,
    initialImages,
    pendingSessionFiles,
    agent.historyReady,
    agent.sendMessage,
    onTitleFromMessage,
    onInitialMessageSent,
  ]);

  async function onSend(payload: { text: string; images: AgentPromptImage[] }) {
    const message = buildModelMessage(payload.text, pendingSessionFiles, payload.images.length);
    if ((!message && payload.images.length === 0) || displayBusy || !agent.historyReady) return;
    setAbortUiSuppressed(false);
    setAbortMessageOverride(null);
    onInputChange('');
    const sendOptions = payload.images.length > 0 ? { images: payload.images } : undefined;
    if (payload.images.length > 0) stagePromptImagesForNextSend(payload.images);
    try {
      await sendMessageWithAdmissionRetry(
        (m, opts) => agent.sendMessage(m, opts),
        message,
        sendOptions,
      );
      clearPendingSessionFilesAfterSend();
      const titleSource = payload.text.trim() || (payload.images.length > 0 ? 'Image' : 'Document');
      if (titleSource) onTitleFromMessage?.(titleSource.slice(0, 48));
    } catch (err) {
      console.error('[chat] send failed', err);
    }
  }

  async function onCancel() {
    if (!busy || canceling) return;
    const submissionId = lastUserMessage(agent.messages)?.submissionId;
    setAbortUiSuppressed(true);
    setAbortMessageOverride(finalizeMessagesForAbortFreeze(agent.messages));
    if (submissionId) {
      const frozenTurn = snapshotAbortedAssistantTurn(agent.messages, submissionId);
      setAbortedTurnSnapshots((previous) => new Map(previous).set(submissionId, frozenTurn));
      setAbortedSubmissionIds((previous) => new Set(previous).add(submissionId));
    }
    setCanceling(true);
    try {
      await client.agents.abort(agentName, agentInstanceId);
    } catch (err) {
      console.error('[chat] abort failed', err);
      setAbortUiSuppressed(false);
      setAbortMessageOverride(null);
      if (submissionId) {
        setAbortedSubmissionIds((previous) => {
          const next = new Set(previous);
          next.delete(submissionId);
          return next;
        });
        setAbortedTurnSnapshots((previous) => {
          const next = new Map(previous);
          next.delete(submissionId);
          return next;
        });
      }
    }
  }

  function assistantTurnSubmissionId(messages: typeof agent.messages): string | undefined {
    for (const message of messages) {
      if (message.submissionId) return message.submissionId;
    }
    return undefined;
  }

  return (
    <>
      <div className="chat-messages" ref={messagesContainerRef}>
        <ChatLinkResolveContext.Provider value={resolveLinkHref}>
        <PublishedArtifactsContext.Provider value={publishedArtifacts}>
        <div className="chat-column">
          {!agent.historyReady && agent.messages.length === 0 && (
            <p className="empty">Loading conversation…</p>
          )}
          {agent.historyReady && rows.length === 0 && !initialMessage && (
            <p className="empty">
              Start a conversation
            </p>
          )}
          {rows.map((row) => {
            if (row.kind === 'user') {
              if (isSubmissionStatusMessage(row.message)) {
                return (
                  <p key={row.message.id} className="chat-status-hint">
                    {userMessageText(row.message)}
                  </p>
                );
              }
              return <UserMessageBubble key={row.message.id} message={row.message} />;
            }
            const parts = filterRenderableParts(mergeAssistantParts(row.messages));
            const submissionId = assistantTurnSubmissionId(row.messages);
            const showAborted = submissionId ? abortedSubmissionIds.has(submissionId) : false;
            const showCopy = !(displayBusy && isLatestAssistantTurn(row.messages, displayMessages));
            return (
              <AssistantMessageBubble
                key={row.messages.map((message) => message.id).join(':') || 'assistant'}
                messages={row.messages}
                showCopy={showCopy}
              >
                {parts.map((part, index) => (
                  <MessagePart key={partRenderKey(part, index)} part={part} />
                ))}
                {showAborted && (
                  <p className="chat-status-hint chat-status-hint-inline">已停止</p>
                )}
              </AssistantMessageBubble>
            );
          })}
          {showThinking && (
            <div className="message assistant">
              <AssistantInProgress status={agent.status} />
            </div>
          )}
          {agent.error && <p className="error inline">{agent.error.message}</p>}
          <div ref={messagesEndRef} />
        </div>
        </PublishedArtifactsContext.Provider>
        </ChatLinkResolveContext.Provider>
      </div>

      <ChatComposer
        value={input}
        onChange={onInputChange}
        onSend={(payload) => void onSend(payload)}
        onCancel={() => void onCancel()}
        disabled={!agent.historyReady}
        busy={displayBusy}
        canceling={canceling}
        sessionFiles={{
          files: pendingSessionFiles,
          processing: hasProcessingSessionFiles(pendingSessionFiles),
          onUpload: onUploadSessionFiles,
          onRemove: onRemoveSessionFile,
          onToggleIncluded: onToggleSessionFileIncluded,
        }}
      />
    </>
  );
}

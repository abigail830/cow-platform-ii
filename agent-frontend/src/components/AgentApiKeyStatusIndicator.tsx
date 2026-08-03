import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import {
  getAgentApiKey,
  subscribeAgentApiKey,
} from '../api/agent-api-key.ts';

function readConfigured(): boolean {
  return getAgentApiKey() !== null;
}

function subscribe(onStoreChange: () => void): () => void {
  return subscribeAgentApiKey(onStoreChange);
}

type AgentApiKeyStatusIndicatorProps = {
  className?: string;
};

export function AgentApiKeyStatusIndicator({ className }: AgentApiKeyStatusIndicatorProps) {
  const configured = useSyncExternalStore(subscribe, readConfigured, () => false);

  const title = configured
    ? 'Playground API key is configured'
    : 'Playground API key is not configured — open API Keys settings';

  return (
    <Link
      to="/settings/api-keys"
      className={`agent-api-key-status${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={title}
    >
      <span
        className={`agent-api-key-status-dot${configured ? ' is-configured' : ' is-missing'}`}
        aria-hidden
      />
      <span className="agent-api-key-status-label">API key</span>
    </Link>
  );
}

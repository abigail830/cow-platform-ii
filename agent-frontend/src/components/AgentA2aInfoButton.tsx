import { IdCard } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { AgentA2aInfo } from '../api/conversations.ts';
import { iconProps } from './icons/icon-props.ts';
import { MessageCopyButton } from './MessageCopyButton.tsx';

type AgentA2aInfoButtonProps = {
  a2a: AgentA2aInfo;
};

function CopyableField({ label, value }: { label: string; value: string }) {
  return (
    <div className="agent-a2a-info-field">
      <span className="agent-a2a-info-field-label">{label}</span>
      <div className="agent-a2a-info-field-row">
        <code className="agent-a2a-info-field-value">{value}</code>
        <MessageCopyButton text={value} />
      </div>
    </div>
  );
}

export function AgentA2aInfoButton({ a2a }: AgentA2aInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="agent-a2a-info" ref={rootRef}>
      <button
        type="button"
        className="chat-icon-btn agent-a2a-info-trigger"
        onClick={() => setOpen((value) => !value)}
        title="A2A connection info"
        aria-label="A2A connection info"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <IdCard {...iconProps({ size: 16 })} />
      </button>

      {open ? (
        <div
          id={panelId}
          className="agent-a2a-info-panel"
          role="dialog"
          aria-label="A2A connection info"
        >
          <div className="agent-a2a-info-panel-header">
            <h3>A2A connection</h3>
          </div>

          <div className="agent-a2a-info-skills">
            <h4>Skills</h4>
            {a2a.skills.map((skill) => (
              <article key={skill.id} className="agent-a2a-info-skill">
                <div className="agent-a2a-info-skill-title">
                  <strong>{skill.name}</strong>
                  <span className="agent-a2a-info-skill-id">{skill.id}</span>
                </div>
                <p>{skill.description}</p>
                {skill.tags.length > 0 ? (
                  <div className="agent-a2a-info-tags">
                    {skill.tags.map((tag) => (
                      <span key={tag} className="agent-a2a-info-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="agent-a2a-info-endpoints">
            <CopyableField label="Agent card" value={a2a.agentCardUrl} />
            <CopyableField label="Message endpoint" value={a2a.endpointUrl} />

            <p className="agent-a2a-info-auth-hint">
              Authenticate with <code>Authorization: Bearer &lt;A2A_API_KEY&gt;</code> when required.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

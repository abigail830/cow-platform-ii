import type { AgentInfo } from '../api/conversations.ts';
import { AgentMenuIcon } from './icons/AgentIcons.tsx';

type AgentListPanelProps = {
  agents: AgentInfo[];
  selectedName: string | null;
  onSelect: (name: string) => void;
};

export function AgentListPanel({ agents, selectedName, onSelect }: AgentListPanelProps) {
  return (
    <aside className="playground-agent-panel">
      <div className="playground-agent-panel-header">
        <h2>Agents</h2>
      </div>
      {agents.length === 0 ? (
        <p className="playground-agent-empty">No agents available.</p>
      ) : (
        <ul className="channel-tree-list root">
          {agents.map((agent) => {
            const active = selectedName === agent.name;
            return (
              <li key={agent.name} className="channel-tree-item">
                <div className={`channel-tree-row${active ? ' active' : ''}`} style={{ paddingLeft: '0.5rem' }}>
                  <button type="button" className="channel-tree-select" onClick={() => onSelect(agent.name)}>
                    <AgentMenuIcon className="storage-icon playground-agent-icon" />
                    <span className="channel-tree-name" title={agent.displayName}>
                      {agent.displayName}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

import { useEffect, useState } from 'react';
import { AgentApiKeyStatusIndicator } from '../components/AgentApiKeyStatusIndicator.tsx';
import { AgentListPanel } from '../components/AgentListPanel.tsx';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { useResizableSplit } from '../hooks/useResizableSplit.ts';
import { AGENT_PAGES } from '../shared/admin-nav.ts';
import { ChatPageContent } from './ChatPage.tsx';

const PAGE = AGENT_PAGES[0]!;

export function AgentPlaygroundPage() {
  const { user, agents } = useAppOutletContext();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const { containerRef, leftPct, onHandleMouseDown } = useResizableSplit('agent-playground-split', 16.5, {
    minPct: 11,
    maxPct: 40,
  });

  useEffect(() => {
    if (!selectedAgent && agents[0]) {
      setSelectedAgent(agents[0].name);
    }
  }, [agents, selectedAgent]);

  useEffect(() => {
    if (!selectedAgent) return;
    if (!agents.some((agent) => agent.name === selectedAgent)) {
      setSelectedAgent(agents[0]?.name ?? null);
    }
  }, [agents, selectedAgent]);

  return (
    <main className="admin-page playground-page">
      <header className="admin-header playground-page-header">
        <div className="playground-page-header-main">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            Select an agent and start a conversation. Each agent keeps its own session history.
          </AdminPageDescription>
        </div>
        <AgentApiKeyStatusIndicator className="playground-page-api-key-status" />
      </header>

      <div
        ref={containerRef}
        className="playground-layout"
        style={{ ['--playground-left-pct' as string]: `${leftPct}%` }}
      >
        <AgentListPanel
          agents={agents}
          selectedName={selectedAgent}
          onSelect={setSelectedAgent}
        />

        <div
          className="playground-split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize agent panel"
          onMouseDown={onHandleMouseDown}
        />

        <section className="playground-main-panel">
          <ChatPageContent
            user={user}
            agents={agents}
            selectedAgent={selectedAgent}
            onSelectAgent={setSelectedAgent}
          />
        </section>
      </div>
    </main>
  );
}

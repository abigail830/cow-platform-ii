import { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import {
  getBuiltinAgentStats,
  getBuiltinAgentsStats,
  type BuiltinAgent,
  type BuiltinAgentUsageStats,
} from '../api/builtinAgents.ts';
import { BUILTIN_WORKFLOW_LABELS } from '../builtin-agents/constants.ts';
import { iconProps } from './icons/icon-props.ts';

const DAY_OPTIONS = [7, 30, 90] as const;

type BuiltinAgentDashboardProps = {
  agents: BuiltinAgent[];
  agentsLoading?: boolean;
};

function formatAxisDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${month}/${day}`;
}

export function BuiltinAgentDashboard({ agents, agentsLoading = false }: BuiltinAgentDashboardProps) {
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);
  const [stats, setStats] = useState<BuiltinAgentUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const load = selectedAgentId
      ? getBuiltinAgentStats(selectedAgentId, days)
      : getBuiltinAgentsStats(days);
    void load
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load stats');
          setStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, days]);

  const maxCount = useMemo(
    () => Math.max(1, ...(stats?.trend.map((point) => point.count) ?? [1])),
    [stats],
  );

  const tickDates = useMemo(() => {
    if (!stats?.trend.length) return new Set<string>();
    const { length } = stats.trend;
    const step = length <= 14 ? 2 : length <= 45 ? 5 : 10;
    const ticks = new Set<string>();
    for (let index = 0; index < length; index += step) {
      ticks.add(stats.trend[index].date);
    }
    ticks.add(stats.trend[length - 1].date);
    return ticks;
  }, [stats]);

  const scopeLabel = selectedAgent
    ? selectedAgent.name
    : 'All builtin agents';

  return (
    <div className="builtin-agent-dashboard">
      <div className="admin-toolbar builtin-agent-dashboard-toolbar">
        <div className="admin-toolbar-left builtin-agent-dashboard-controls">
          <label className="builtin-agent-dashboard-control">
            <span className="builtin-agent-dashboard-control-label">Agent</span>
            <select
              className="builtin-agent-dashboard-select"
              value={selectedAgentId}
              disabled={agentsLoading}
              onChange={(event) => setSelectedAgentId(event.target.value)}
            >
              <option value="">All agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {BUILTIN_WORKFLOW_LABELS[agent.workflow_key]}
                </option>
              ))}
            </select>
          </label>

          <div className="builtin-agent-dashboard-control builtin-agent-dashboard-control--range">
            <span className="builtin-agent-dashboard-control-label">Range</span>
            <div className="admin-filters builtin-agent-dashboard-range-filters">
              {DAY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`admin-filter${days === option ? ' active' : ''}`}
                  onClick={() => setDays(option)}
                >
                  {option}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error ? <p className="admin-error" role="alert">{error}</p> : null}

      {loading ? (
        <p className="admin-muted">Loading usage stats…</p>
      ) : stats ? (
        <>
          <div className="builtin-agent-dashboard-stat">
            <div className="builtin-agent-dashboard-stat-icon" aria-hidden>
              <Activity {...iconProps({ size: 20 })} />
            </div>
            <div>
              <p className="builtin-agent-dashboard-stat-label">Total runs</p>
              <p className="builtin-agent-dashboard-stat-value">{stats.total_runs.toLocaleString()}</p>
              <p className="admin-muted builtin-agent-dashboard-stat-hint">
                All time · {scopeLabel}
                {selectedAgent ? ' (including test runs)' : null}
              </p>
            </div>
          </div>

          <section className="builtin-agent-dashboard-trend" aria-label="Runs over time">
            <div className="builtin-agent-dashboard-trend-header">
              <h4>Runs over time</h4>
              <span className="admin-muted">UTC · last {stats.days} days</span>
            </div>

            {stats.trend.every((point) => point.count === 0) ? (
              <p className="admin-muted builtin-agent-dashboard-empty">No runs in this period.</p>
            ) : (
              <div className="builtin-agent-trend-chart" role="img" aria-label="Daily run counts">
                {stats.trend.map((point) => {
                  const heightPct = Math.round((point.count / maxCount) * 100);
                  const showLabel = tickDates.has(point.date);
                  return (
                    <div
                      key={point.date}
                      className="builtin-agent-trend-bar-wrap"
                      title={`${point.date}: ${point.count} run${point.count === 1 ? '' : 's'}`}
                    >
                      <div className="builtin-agent-trend-bar-track">
                        <div
                          className="builtin-agent-trend-bar"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      {showLabel ? (
                        <span className="builtin-agent-trend-label">{formatAxisDate(point.date)}</span>
                      ) : (
                        <span className="builtin-agent-trend-label" aria-hidden />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

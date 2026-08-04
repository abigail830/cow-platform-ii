import { Fragment, useEffect, useMemo, useState } from 'react';
import { Activity, ChevronRight } from 'lucide-react';
import {
  getBuiltinAgentStats,
  getBuiltinAgentsStats,
  listBuiltinAgentRuns,
  type BuiltinAgent,
  type BuiltinAgentRunListItem,
  type BuiltinAgentUsageStats,
} from '../api/builtinAgents.ts';
import { BUILTIN_WORKFLOW_LABELS } from '../builtin-agents/constants.ts';
import { iconProps } from './icons/icon-props.ts';

const DAY_OPTIONS = [7, 30] as const;
const PREVIEW_LENGTH = 96;

type BuiltinAgentDashboardProps = {
  agents: BuiltinAgent[];
  agentsLoading?: boolean;
};

function formatAxisDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${month}/${day}`;
}

function formatRunTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncateText(text: string, maxLen = PREVIEW_LENGTH): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '—';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trim()}…`;
}

function runInputText(run: BuiltinAgentRunListItem): string {
  const userMessages = run.messages.filter((message) => message.role === 'user');
  if (userMessages.length > 0) {
    return userMessages.map((message) => message.content).join('\n\n');
  }
  return run.input_summary?.trim() ?? '';
}

function runOutputText(run: BuiltinAgentRunListItem): string {
  if (run.status === 'failed' && run.error_message?.trim()) {
    return run.error_message.trim();
  }
  const assistantMessages = run.messages.filter((message) => message.role === 'assistant');
  if (assistantMessages.length > 0) {
    return assistantMessages.map((message) => message.content).join('\n\n');
  }
  return '';
}

function formatLatency(latencyMs: number | null): string {
  if (latencyMs == null) return '—';
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(1)} s`;
  return `${latencyMs} ms`;
}

type BuiltinAgentRunsTableProps = {
  runs: BuiltinAgentRunListItem[];
};

function BuiltinAgentRunsTable({ runs }: BuiltinAgentRunsTableProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  function toggleRun(runId: string) {
    setExpandedRunId((current) => (current === runId ? null : runId));
  }

  return (
    <div className="admin-table-wrap builtin-agent-runs-table-wrap">
      <table className="admin-table builtin-agent-runs-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Agent</th>
            <th>Input</th>
            <th>Output</th>
            <th>Result</th>
            <th>Latency</th>
            <th className="builtin-agent-runs-detail-col" aria-label="Detail" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const expanded = expandedRunId === run.id;
            const inputText = runInputText(run);
            const outputText = runOutputText(run);
            return (
              <Fragment key={run.id}>
                <tr
                  className={`builtin-agent-runs-row${expanded ? ' expanded' : ''}`}
                  onClick={() => toggleRun(run.id)}
                >
                  <td className="builtin-agent-runs-time">{formatRunTime(run.created_at)}</td>
                  <td className="builtin-agent-runs-agent">{run.agent_name ?? 'Unknown agent'}</td>
                  <td className="builtin-agent-runs-preview" title={inputText || undefined}>
                    {truncateText(inputText)}
                  </td>
                  <td
                    className={`builtin-agent-runs-preview${
                      run.status === 'failed' ? ' builtin-agent-runs-preview--error' : ''
                    }`}
                    title={outputText || undefined}
                  >
                    {truncateText(outputText)}
                  </td>
                  <td>
                    <span
                      className={`kb-status-badge ${
                        run.status === 'success' ? 'kb-status-completed' : 'kb-status-failed'
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="builtin-agent-runs-latency">{formatLatency(run.latency_ms)}</td>
                  <td className="builtin-agent-runs-detail-col">
                    <button
                      type="button"
                      className="icon-btn builtin-agent-runs-detail-btn"
                      title="View detail"
                      aria-label="View run detail"
                      aria-expanded={expanded}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleRun(run.id);
                      }}
                    >
                      <ChevronRight
                        {...iconProps({
                          className: expanded ? 'builtin-agent-runs-chevron expanded' : 'builtin-agent-runs-chevron',
                        })}
                      />
                    </button>
                  </td>
                </tr>
                {expanded ? (
                  <tr className="builtin-agent-runs-detail-row">
                    <td colSpan={7}>
                      <div className="builtin-agent-runs-detail-panel">
                        <div className="builtin-agent-runs-detail-meta">
                          <span>
                            {BUILTIN_WORKFLOW_LABELS[
                              run.workflow_key as keyof typeof BUILTIN_WORKFLOW_LABELS
                            ] ?? run.workflow_key}
                          </span>
                          <span className="admin-muted">·</span>
                          <span className="admin-muted">{run.trigger_type}</span>
                        </div>
                        <div className="builtin-agent-runs-detail-grid">
                          <div className="builtin-agent-run-field">
                            <span className="builtin-agent-run-field-label">Input</span>
                            <pre className="builtin-agent-run-field-text">
                              {inputText || '—'}
                            </pre>
                          </div>
                          <div className="builtin-agent-run-field">
                            <span className="builtin-agent-run-field-label">Output</span>
                            <pre
                              className={`builtin-agent-run-field-text${
                                run.status === 'failed' ? ' builtin-agent-run-field-text--error' : ''
                              }`}
                            >
                              {outputText || '—'}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BuiltinAgentDashboard({ agents, agentsLoading = false }: BuiltinAgentDashboardProps) {
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(7);
  const [stats, setStats] = useState<BuiltinAgentUsageStats | null>(null);
  const [runs, setRuns] = useState<BuiltinAgentRunListItem[]>([]);
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
    const statsPromise = selectedAgentId
      ? getBuiltinAgentStats(selectedAgentId, days)
      : getBuiltinAgentsStats(days);
    const runsPromise = listBuiltinAgentRuns({
      days,
      agentId: selectedAgentId || undefined,
    });
    void Promise.all([statsPromise, runsPromise])
      .then(([statsData, runsData]) => {
        if (!cancelled) {
          setStats(statsData);
          setRuns(runsData);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load stats');
          setStats(null);
          setRuns([]);
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
    const step = length <= 14 ? 1 : 5;
    const ticks = new Set<string>();
    for (let index = 0; index < length; index += step) {
      ticks.add(stats.trend[index].date);
    }
    ticks.add(stats.trend[length - 1].date);
    return ticks;
  }, [stats]);

  const scopeLabel = selectedAgent ? selectedAgent.name : 'All builtin agents';

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
          <div className="builtin-agent-dashboard-summary-row">
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
          </div>

          <section className="builtin-agent-dashboard-runs" aria-label="Recent runs">
            <div className="builtin-agent-dashboard-runs-header">
              <h4>Recent runs</h4>
              <span className="admin-muted">UTC · last {stats.days} days</span>
            </div>

            {runs.length === 0 ? (
              <p className="admin-muted builtin-agent-dashboard-empty">No runs in this period.</p>
            ) : (
              <BuiltinAgentRunsTable runs={runs} />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

import { getPool } from '../db/pool.ts';
import { toAgentInstanceId } from '../shared/model/agent-instance-id.ts';

/** Prefix of `flue_agent_submissions.session_key` for a Flue agent instance. */
export function flueSubmissionSessionKeyPrefix(instanceId: string): string {
  return `agent-session:["${instanceId}",`;
}

export type SessionTurnCountInput = {
  conversationId: string;
  userId: string;
};

/**
 * Count user turns via `flue_agent_submissions` (`kind = direct`) — one SQL round-trip
 * for the whole page, without loading conversation stream history.
 */
export async function countSessionTurnsFromSubmissions(
  sessions: SessionTurnCountInput[],
): Promise<Map<string, number>> {
  if (sessions.length === 0) return new Map();

  const conversationIds = sessions.map((session) => session.conversationId);
  const instanceIds = sessions.map((session) =>
    toAgentInstanceId(session.userId, session.conversationId),
  );

  const pool = getPool();
  const result = await pool.query<{ conversation_id: string; turn_count: number }>(
    `
      WITH sessions AS (
        SELECT *
        FROM UNNEST($1::uuid[], $2::text[]) AS t(conversation_id, instance_id)
      )
      SELECT s.conversation_id,
        COUNT(sub.submission_id)::int AS turn_count
      FROM sessions s
      LEFT JOIN flue_agent_submissions sub
        ON sub.kind = 'direct'
       AND sub.session_key LIKE 'agent-session:["' || s.instance_id || '",%'
      GROUP BY s.conversation_id
    `,
    [conversationIds, instanceIds],
  );

  return new Map(result.rows.map((row) => [row.conversation_id, row.turn_count]));
}

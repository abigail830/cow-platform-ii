/**
 * Dispatch openkms-cli pipeline jobs to GitHub Actions (workflow_dispatch).
 *
 * Used when PIPELINE_WORKER=github_actions (default on Vercel).
 */

export type GithubActionsDispatchInput = {
  jobId: string;
  pageIndexStrategy?: string;
};

export type GithubActionsConfig = {
  token: string;
  repository: string;
  workflowFile: string;
  ref: string;
};

export function resolveGithubActionsConfig(
  env: NodeJS.ProcessEnv = process.env,
): GithubActionsConfig | null {
  const token = env.GITHUB_PIPELINE_TOKEN?.trim() || env.GITHUB_TOKEN?.trim();
  const repository = env.GITHUB_PIPELINE_REPOSITORY?.trim();
  const workflowFile =
    env.GITHUB_PIPELINE_WORKFLOW?.trim() || 'openkms-pipeline.yml';
  const ref = env.GITHUB_PIPELINE_REF?.trim() || 'main';

  if (!token || !repository) return null;
  return { token, repository, workflowFile, ref };
}

export function githubActionsDispatchUrl(config: GithubActionsConfig): string {
  const [owner, repo] = config.repository.split('/');
  if (!owner || !repo) {
    throw new Error(
      `Invalid GITHUB_PIPELINE_REPOSITORY "${config.repository}" (expected owner/repo)`,
    );
  }
  return `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(config.workflowFile)}/dispatches`;
}

export async function triggerGithubActionsPipeline(
  input: GithubActionsDispatchInput,
  config: GithubActionsConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = githubActionsDispatchUrl(config);
  const body: {
    ref: string;
    inputs: { job_id: string; page_index_strategy?: string };
  } = {
    ref: config.ref,
    inputs: { job_id: input.jobId },
  };
  if (input.pageIndexStrategy?.trim()) {
    body.inputs.page_index_strategy = input.pageIndexStrategy.trim();
  }

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 204) return;

  const text = await response.text();
  let detail = text;
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (parsed.message) detail = parsed.message;
  } catch {
    // keep raw text
  }
  throw new Error(
    `GitHub Actions dispatch failed (${response.status}): ${detail.slice(0, 500)}`,
  );
}

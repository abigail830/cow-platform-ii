/**
 * Dispatch KB import jobs to GitHub Actions (workflow_dispatch).
 */

export type KbPageIndexImportGithubDispatchInput = {
  jobId: string;
  workerCliArgs?: string[];
};

export type KbPageIndexImportGithubConfig = {
  token: string;
  repository: string;
  workflowFile: string;
  ref: string;
};

export function resolveKbPageIndexImportGithubConfig(
  env: NodeJS.ProcessEnv = process.env,
): KbPageIndexImportGithubConfig | null {
  const token = env.GITHUB_PIPELINE_TOKEN?.trim() || env.GITHUB_TOKEN?.trim();
  const repository = env.GITHUB_PIPELINE_REPOSITORY?.trim();
  const workflowFile =
    env.GITHUB_KB_PAGEINDEX_IMPORT_WORKFLOW?.trim() || 'openkms-kb-pageindex-import.yml';
  const ref = env.GITHUB_PIPELINE_REF?.trim() || 'main';

  if (!token || !repository) return null;
  return { token, repository, workflowFile, ref };
}

export function kbPageIndexImportGithubDispatchUrl(config: KbPageIndexImportGithubConfig): string {
  const [owner, repo] = config.repository.split('/');
  if (!owner || !repo) {
    throw new Error(
      `Invalid GITHUB_PIPELINE_REPOSITORY "${config.repository}" (expected owner/repo)`,
    );
  }
  return `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(config.workflowFile)}/dispatches`;
}

export async function triggerKbPageIndexImportGithubActions(
  input: KbPageIndexImportGithubDispatchInput,
  config: KbPageIndexImportGithubConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = kbPageIndexImportGithubDispatchUrl(config);
  const body: {
    ref: string;
    inputs: { job_id: string; worker_cli_args?: string };
  } = {
    ref: config.ref,
    inputs: { job_id: input.jobId },
  };

  if (input.workerCliArgs && input.workerCliArgs.length > 0) {
    body.inputs.worker_cli_args = JSON.stringify(input.workerCliArgs);
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
    `GitHub Actions KB import dispatch failed (${response.status}): ${detail.slice(0, 500)}`,
  );
}

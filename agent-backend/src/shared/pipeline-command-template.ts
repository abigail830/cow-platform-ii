export function renderCommandTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => values[key] ?? '');
}

/** Async pipelines may list submit + finalize commands on separate lines. */
export function parseAsyncPipelineCommandTemplate(commandTemplate: string): {
  submitTemplate: string;
  finalizeTemplate: string | null;
} {
  const lines = commandTemplate
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const submitTemplate = lines.find((line) => /\bpipeline\s+submit\b/.test(line)) ?? lines[0] ?? '';
  const finalizeTemplate = lines.find((line) => /\bpipeline\s+finalize\b/.test(line)) ?? null;

  return { submitTemplate, finalizeTemplate };
}

export function pipelineTemplateToCliArgs(
  template: string,
  values: Record<string, string>,
): string[] {
  const rendered = renderCommandTemplate(template.trim(), values);
  const body = rendered.replace(/^openkms-cli\s+/i, '').trim();
  if (!body) return [];

  const tokens: string[] = [];
  let index = 0;
  while (index < body.length) {
    if (body[index] === ' ') {
      index += 1;
      continue;
    }
    const quote = body[index];
    if (quote === "'" || quote === '"') {
      index += 1;
      let token = '';
      while (index < body.length && body[index] !== quote) {
        if (body[index] === '\\' && index + 1 < body.length) {
          index += 1;
          token += body[index];
        } else {
          token += body[index];
        }
        index += 1;
      }
      if (body[index] === quote) index += 1;
      tokens.push(token);
      continue;
    }
    let token = '';
    while (index < body.length && body[index] !== ' ') {
      token += body[index];
      index += 1;
    }
    tokens.push(token);
  }
  return tokens;
}

export function defaultFinalizeTemplate(pipelineName: string): string {
  if (pipelineName === 'aliyun-docmind-parse') {
    return 'openkms-cli pipeline finalize --job-id {job_id} --page-index-strategy aliyun-layouts';
  }
  return 'openkms-cli pipeline finalize --job-id {job_id}';
}

export const DEFAULT_ASYNC_SUBMIT_TEMPLATE = 'openkms-cli pipeline submit --job-id {job_id}';

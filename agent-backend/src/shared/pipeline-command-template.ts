export function renderCommandTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => values[key] ?? '');
}

/** First worker line: run-async (or legacy finalize) with optional flags. */
export function parseAsyncWorkerTemplate(commandTemplate: string, pipelineName: string): string {
  const lines = commandTemplate
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const workerLine =
    lines.find((line) => /\bpipeline\s+run-async\b/.test(line)) ??
    lines.find((line) => /\bpipeline\s+extract-metadata\b/.test(line)) ??
    lines.find((line) => /\bpipeline\s+finalize\b/.test(line)) ??
    lines[0] ??
    '';
  return workerLine.trim() || defaultAsyncWorkerTemplate(pipelineName);
}

/** Strip openkms-cli / evaluate-cli binary prefix before tokenizing worker args. */
export function stripWorkerCliBinaryPrefix(rendered: string): string {
  return rendered.replace(/^(?:openkms-cli|evaluate-cli)\s+/i, '').trim();
}

export function pipelineTemplateToCliArgs(
  template: string,
  values: Record<string, string>,
): string[] {
  const rendered = renderCommandTemplate(template.trim(), values);
  const body = stripWorkerCliBinaryPrefix(rendered);
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

/** Normalize legacy finalize template line to run-async. */
export function normalizeAsyncWorkerCliArgs(args: string[]): string[] {
  if (args.length >= 2 && args[0] === 'pipeline' && args[1] === 'finalize') {
    return ['pipeline', 'run-async', ...args.slice(2)];
  }
  return args;
}

/** Map openkms-cli audio-pipeline worker args to evaluate-cli pipeline args. */
export function mapOpenkmsAudioCliArgsToEvaluateCli(args: string[]): string[] {
  const normalized = normalizeAsyncWorkerCliArgs(args);
  if (normalized.length >= 2 && normalized[0] === 'audio-pipeline') {
    return ['pipeline', ...normalized.slice(1)];
  }
  if (normalized.length >= 2 && normalized[0] === 'pipeline') {
    return normalized;
  }
  return normalized;
}

/** Read --page-index-strategy from parsed CLI args (for GHA workflow inputs). */
export function pageIndexStrategyFromCliArgs(args: string[]): string | undefined {
  const idx = args.indexOf('--page-index-strategy');
  if (idx >= 0 && args[idx + 1]?.trim()) return args[idx + 1].trim();
  return undefined;
}

/** First non-comment line of a command template (worker entrypoint). */
export function parseWorkerCommandLine(commandTemplate: string, fallback: string): string {
  const lines = commandTemplate
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  return lines[0]?.trim() || fallback;
}

export function buildWorkerCliArgsFromTemplate(
  commandTemplate: string,
  fallbackTemplate: string,
  values: Record<string, string>,
): string[] {
  const line = parseWorkerCommandLine(commandTemplate, fallbackTemplate);
  const args = pipelineTemplateToCliArgs(line, values);
  if (args.length === 0) {
    return pipelineTemplateToCliArgs(fallbackTemplate, values);
  }
  return args;
}

/** Full async job in one CLI process (submit + poll + finalize worker). */
export function defaultAsyncWorkerTemplate(pipelineName: string): string {
  if (pipelineName === 'metadata-extract') {
    return 'openkms-cli pipeline extract-metadata --job-id {job_id}';
  }
  if (pipelineName === 'aliyun-docmind-parse') {
    return 'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy aliyun-layouts';
  }
  if (pipelineName === 'baidu-doc-parse') {
    return 'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy baidu-layouts';
  }
  if (pipelineName === 'paddleocr-doc-parse') {
    return 'openkms-cli pipeline run-async --job-id {job_id} --page-index-strategy markdown-headings';
  }
  return 'openkms-cli pipeline run-async --job-id {job_id}';
}

/** evaluate-cli worker entrypoint — job config is loaded from DB via internal API. */
export function defaultEvalAsyncWorkerTemplate(): string {
  return 'evaluate-cli pipeline run-async --job-id {job_id}';
}

export function buildEvalWorkerCliArgsFromTemplate(jobId: string): string[] {
  const args = pipelineTemplateToCliArgs(defaultEvalAsyncWorkerTemplate(), { job_id: jobId });
  if (args.length >= 3 && args[0] === 'pipeline' && args[1] === 'run-async') {
    return args;
  }
  return ['pipeline', 'run-async', '--job-id', jobId];
}

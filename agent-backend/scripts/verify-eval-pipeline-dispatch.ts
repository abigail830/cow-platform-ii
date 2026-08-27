/**
 * Verify eval vs audio GHA dispatch wiring.
 * Documents the pre-fix bug and asserts current runner uses evaluate-pipeline.yml + evaluate-cli args.
 *
 * Run: cd agent-backend && npm run verify:eval-pipeline-dispatch
 */
import './load-env.ts';
import { getPipelineConfigByPipelineName } from '../src/shared/pipeline-config-store.ts';
import {
  mapOpenkmsAudioCliArgsToEvaluateCli,
  normalizeAsyncWorkerCliArgs,
  parseAsyncWorkerTemplate,
  pipelineTemplateToCliArgs,
} from '../src/shared/pipeline-command-template.ts';
import { buildEvalWorkerCliArgs } from '../src/services/eval-pipeline-runner.ts';
import {
  DEFAULT_EVAL_PIPELINE_WORKFLOW_FILE,
  resolveEvalPipelineGithubConfig,
} from '../src/services/eval-pipeline-github-actions.ts';
import { resolveAudioPipelineGithubConfig } from '../src/services/audio-pipeline-github-actions.ts';
import { defaultAudioPipelineWorkflowFile } from '../src/services/audio-pipeline-jobs.ts';

const TEST_JOB_ID = '00000000-0000-0000-0000-000000000001';
const PIPELINES = ['aliyun-fun-asr-transcribe', 'aliyun-qwen-audio-transcribe'] as const;

/** Pre-9a43f20 eval runner logic — reproduced to explain production failures. */
function legacyEvalWorkerArgs(pipelineName: string, commandTemplate: string): string[] {
  const template = parseAsyncWorkerTemplate(commandTemplate, pipelineName);
  return mapOpenkmsAudioCliArgsToEvaluateCli(
    normalizeAsyncWorkerCliArgs(pipelineTemplateToCliArgs(template, { job_id: TEST_JOB_ID })),
  );
}

function legacyEvalWorkflowFile(workflowFile: string | null | undefined): string {
  return (
    workflowFile?.trim() ||
    process.env.GITHUB_EVAL_PIPELINE_WORKFLOW?.trim() ||
    DEFAULT_EVAL_PIPELINE_WORKFLOW_FILE
  );
}

async function main(): Promise<void> {
  console.log('=== Eval vs Audio dispatch parity ===\n');

  const evalCfg = resolveEvalPipelineGithubConfig();
  if (!evalCfg) throw new Error('GITHUB_PIPELINE_TOKEN / GITHUB_PIPELINE_REPOSITORY missing in env');

  console.log('audio default workflow:', resolveAudioPipelineGithubConfig()?.workflowFile);
  console.log('eval default workflow:', evalCfg.workflowFile);
  console.log('current eval worker args:', buildEvalWorkerCliArgs(TEST_JOB_ID));
  console.log('');

  for (const pipelineName of PIPELINES) {
    const pipeline = await getPipelineConfigByPipelineName(pipelineName);
    if (!pipeline) throw new Error(`missing pipeline config: ${pipelineName}`);

    const audioWorkflow =
      pipeline.workflowFile?.trim() ||
      process.env.GITHUB_AUDIO_PIPELINE_WORKFLOW?.trim() ||
      defaultAudioPipelineWorkflowFile(pipelineName);

    const audioArgs = normalizeAsyncWorkerCliArgs(
      pipelineTemplateToCliArgs(
        parseAsyncWorkerTemplate(pipeline.commandTemplate ?? '', pipelineName),
        { job_id: TEST_JOB_ID },
      ),
    );

    const legacyWorkflow = legacyEvalWorkflowFile(pipeline.workflowFile);
    const legacyArgs = legacyEvalWorkerArgs(pipelineName, pipeline.commandTemplate ?? '');

    console.log(`--- ${pipelineName} ---`);
    console.log('  shared DB workflow_file:', pipeline.workflowFile);
    console.log('  audio → workflow:', audioWorkflow, '| args:', audioArgs.join(' '));
    console.log('  LEGACY eval → workflow:', legacyWorkflow, '| args:', legacyArgs.join(' '));
    console.log(
      '  CURRENT eval → workflow:',
      evalCfg.workflowFile,
      '| args:',
      buildEvalWorkerCliArgs(TEST_JOB_ID).join(' '),
    );

    if (legacyWorkflow === audioWorkflow && legacyArgs[0] !== audioArgs[0]) {
      console.log(
        '  >> Root cause: same workflow as audio but args mapped for evaluate-cli; ' +
          'openkms-audio-transcribe runs openkms-cli → GET /internal-api/pipeline/jobs → 404',
      );
    }
    console.log('');
  }

  const fixedArgs = buildEvalWorkerCliArgs(TEST_JOB_ID);
  if (evalCfg.workflowFile !== DEFAULT_EVAL_PIPELINE_WORKFLOW_FILE) {
    throw new Error(`eval workflow must be ${DEFAULT_EVAL_PIPELINE_WORKFLOW_FILE}`);
  }
  if (fixedArgs.join(' ') !== `pipeline run-async --job-id ${TEST_JOB_ID}`) {
    throw new Error(`unexpected eval worker args: ${fixedArgs.join(' ')}`);
  }

  console.log('verify-eval-pipeline-dispatch: OK (current runner wired correctly)');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

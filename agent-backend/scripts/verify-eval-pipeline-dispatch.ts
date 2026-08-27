/**
 * Verify eval transcribe dispatch reuses the audio pipeline worker (openkms-audio-transcribe.yml).
 *
 * Run: cd agent-backend && npm run verify:eval-pipeline-dispatch
 */
import './load-env.ts';
import { getPipelineConfigByPipelineName } from '../src/shared/pipeline/pipeline-config-store.ts';
import {
  normalizeAsyncWorkerCliArgs,
  parseAsyncWorkerTemplate,
  pipelineTemplateToCliArgs,
} from '../src/shared/pipeline/pipeline-command-template.ts';
import { resolveAudioPipelineGithubConfig } from '../src/services/audio/audio-pipeline-github-actions.ts';
import { defaultAudioPipelineWorkflowFile } from '../src/services/audio/audio-pipeline-jobs.ts';

const TEST_JOB_ID = '00000000-0000-0000-0000-000000000001';
const PIPELINES = ['aliyun-fun-asr-transcribe', 'aliyun-qwen-audio-transcribe'] as const;

async function main(): Promise<void> {
  console.log('=== Eval transcribe uses audio pipeline ===\n');

  const audioCfg = resolveAudioPipelineGithubConfig();
  if (!audioCfg) throw new Error('GITHUB_PIPELINE_TOKEN / GITHUB_PIPELINE_REPOSITORY missing in env');

  console.log('audio GHA workflow:', audioCfg.workflowFile);
  console.log('');

  for (const pipelineName of PIPELINES) {
    const pipeline = await getPipelineConfigByPipelineName(pipelineName);
    if (!pipeline) throw new Error(`missing pipeline config: ${pipelineName}`);

    const workflow =
      pipeline.workflowFile?.trim() ||
      process.env.GITHUB_AUDIO_PIPELINE_WORKFLOW?.trim() ||
      defaultAudioPipelineWorkflowFile(pipelineName);

    const args = normalizeAsyncWorkerCliArgs(
      pipelineTemplateToCliArgs(
        parseAsyncWorkerTemplate(pipeline.commandTemplate ?? '', pipelineName),
        { job_id: TEST_JOB_ID },
      ),
    );

    console.log(`--- ${pipelineName} ---`);
    console.log('  workflow:', workflow);
    console.log('  worker args:', args.join(' '));

    if (args[0] !== 'audio-pipeline') {
      throw new Error(`${pipelineName} worker must use audio-pipeline, got ${args[0]}`);
    }
    if (workflow !== audioCfg.workflowFile) {
      throw new Error(`${pipelineName} workflow must match audio default ${audioCfg.workflowFile}`);
    }
    console.log('');
  }

  console.log('verify-eval-pipeline-dispatch: OK (eval transcribe reuses audio pipeline worker)');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

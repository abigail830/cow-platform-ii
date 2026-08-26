import { Hono } from 'hono';
import documents from './documents.ts';
import kbImportJobs from './kb-import-jobs.ts';
import knowledgeBasesInternal from './knowledge-bases.ts';
import models from './models.ts';
import pipelineJobs from './pipeline-jobs.ts';
import audioPipelineJobs from './audio-pipeline-jobs.ts';
import audioCapturePipelineJobs from './audio-capture-pipeline-jobs.ts';
import evalPipelineJobs from './eval-pipeline-jobs.ts';

const internalApi = new Hono();

internalApi.route('/documents', documents);
internalApi.route('/kb-import-jobs', kbImportJobs);
internalApi.route('/kb-pageindex-import-jobs', kbImportJobs);
internalApi.route('/knowledge-bases', knowledgeBasesInternal);
internalApi.route('/models', models);
internalApi.route('/pipeline/jobs', pipelineJobs);
internalApi.route('/audio-pipeline/jobs', audioPipelineJobs);
internalApi.route('/audio-capture-pipeline/jobs', audioCapturePipelineJobs);
internalApi.route('/eval-pipeline/jobs', evalPipelineJobs);

export default internalApi;

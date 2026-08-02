import { Hono } from 'hono';
import documents from './documents.ts';
import kbPageIndexImportJobs from './kb-pageindex-import-jobs.ts';
import knowledgeBasesInternal from './knowledge-bases.ts';
import models from './models.ts';
import pipelineJobs from './pipeline-jobs.ts';

const internalApi = new Hono();

internalApi.route('/documents', documents);
internalApi.route('/kb-pageindex-import-jobs', kbPageIndexImportJobs);
internalApi.route('/kb-import-jobs', kbPageIndexImportJobs);
internalApi.route('/knowledge-bases', knowledgeBasesInternal);
internalApi.route('/models', models);
internalApi.route('/pipeline/jobs', pipelineJobs);

export default internalApi;

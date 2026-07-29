import { Hono } from 'hono';
import documents from './documents.ts';
import models from './models.ts';
import pipelineJobs from './pipeline-jobs.ts';

const internalApi = new Hono();

internalApi.route('/documents', documents);
internalApi.route('/models', models);
internalApi.route('/pipeline/jobs', pipelineJobs);

export default internalApi;

import { Hono } from 'hono';
import models from './models.ts';
import builtinAgents from './builtin-agents.ts';
import asrHotwords from './asr-hotwords.ts';
import permissions from './permissions.ts';
import pipelines from './pipelines.ts';
import roles from './roles.ts';
import users from './users.ts';

const admin = new Hono();

admin.route('/models', models);
admin.route('/builtin-agents', builtinAgents);
admin.route('/pipelines', pipelines);
admin.route('/asr-hotwords', asrHotwords);
admin.route('/permissions', permissions);
admin.route('/roles', roles);
admin.route('/users', users);

export default admin;

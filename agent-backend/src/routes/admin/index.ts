import { Hono } from 'hono';
import models from './models.ts';
import permissions from './permissions.ts';
import roles from './roles.ts';
import users from './users.ts';

const admin = new Hono();

admin.route('/models', models);
admin.route('/permissions', permissions);
admin.route('/roles', roles);
admin.route('/users', users);

export default admin;

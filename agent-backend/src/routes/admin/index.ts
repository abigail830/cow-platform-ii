import { Hono } from 'hono';
import models from './models.ts';

const admin = new Hono();

admin.route('/models', models);

export default admin;

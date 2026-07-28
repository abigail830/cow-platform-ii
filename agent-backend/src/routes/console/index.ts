import { Hono } from 'hono';
import storage from './storage.ts';

const consoleRoutes = new Hono();

consoleRoutes.route('/storage', storage);

export default consoleRoutes;

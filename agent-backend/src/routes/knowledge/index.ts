import { Hono } from 'hono';
import asrHotwords from './asr-hotwords.ts';

const knowledge = new Hono();

knowledge.route('/asr-hotwords', asrHotwords);

export default knowledge;

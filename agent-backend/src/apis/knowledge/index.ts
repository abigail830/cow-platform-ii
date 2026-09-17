import { Hono } from 'hono';
import documentChannels from './document-channels.ts';
import documents from './documents.ts';
import captures from './captures.ts';
import knowledgeBases from './knowledge-bases.ts';
import hybridSearch from './hybrid-search.ts';
import asrHotwords from './asr-hotwords.ts';
import workflows from './workflows.ts';

const knowledge = new Hono();

knowledge.route('/document-channels', documentChannels);
knowledge.route('/documents', documents);
knowledge.route('/captures', captures);
knowledge.route('/knowledge-bases', knowledgeBases);
knowledge.route('/hybrid-search', hybridSearch);
knowledge.route('/asr-hotwords', asrHotwords);
knowledge.route('/workflows', workflows);

export default knowledge;

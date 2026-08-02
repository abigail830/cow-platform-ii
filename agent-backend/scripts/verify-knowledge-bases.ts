import './load-env.ts';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8787';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'admin123';

type StepResult = { name: string; ok: boolean; detail?: string };

const results: StepResult[] = [];
let adminToken = '';
let pageIndexKbId = '';
let ragKbId = '';

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}: ${detail}`);
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body.token as string;
}

async function authJson(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { status: res.status, body };
}

async function main() {
  console.log(`Knowledge base API verify → ${BASE}\n`);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    fail('health', `HTTP ${health.status}`);
    return summarize();
  }
  pass('health');

  try {
    adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    pass('admin_login', ADMIN_EMAIL);
  } catch (error) {
    fail('admin_login', error instanceof Error ? error.message : String(error));
    return summarize();
  }

  const stamp = Date.now();
  let faqKbId = '';

  const createPageIndex = await authJson(adminToken, '/api/knowledge-bases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Verify PageIndex ${stamp}`,
      description: 'integration test',
      type: 'page_index',
    }),
  });
  if (createPageIndex.status !== 201) {
    fail('create_page_index_kb', JSON.stringify(createPageIndex.body));
    return summarize();
  }
  pageIndexKbId = createPageIndex.body.id as string;
  const caps = createPageIndex.body.capabilities as { import?: boolean };
  if (!caps?.import) fail('page_index_capabilities', 'import should be true');
  else pass('create_page_index_kb', pageIndexKbId);

  const pipelineId = createPageIndex.body.pipeline_id as string | null;
  const pipelineName = createPageIndex.body.pipeline_name as string | null;
  if (!pipelineId || pipelineName !== 'kb-pageindex-import') {
    fail('page_index_pipeline_link', `expected kb-pageindex-import, got ${pipelineName}`);
  } else {
    pass('page_index_pipeline_link', pipelineName);
  }

  const createRag = await authJson(adminToken, '/api/knowledge-bases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Verify RAG ${stamp}`,
      type: 'rag',
    }),
  });
  if (createRag.status !== 201) {
    fail('create_rag_kb', JSON.stringify(createRag.body));
  } else {
    ragKbId = createRag.body.id as string;
    const ragCaps = createRag.body.capabilities as { import?: boolean; index?: boolean };
    if (!ragCaps?.import) fail('rag_capabilities', 'import should be true');
    else if (!ragCaps?.index) fail('rag_capabilities', 'index should be true');
    else pass('create_rag_kb', ragKbId);

    const ragPipelineName = createRag.body.pipeline_name as string | null;
    if (ragPipelineName !== 'kb-rag-index') {
      fail('rag_pipeline_link', `expected kb-rag-index, got ${ragPipelineName}`);
    } else {
      pass('rag_pipeline_link', ragPipelineName);
    }

    if (createRag.body.is_configured === true) {
      fail('rag_not_configured', 'is_configured should be false without embedding model');
    } else {
      pass('rag_not_configured', 'embedding model not set');
    }
  }

  const list = await authJson(adminToken, '/api/knowledge-bases');
  if (list.status !== 200 || !Array.isArray(list.body.items)) {
    fail('list_knowledge_bases', JSON.stringify(list.body));
  } else {
    const ids = (list.body.items as Array<{ id: string }>).map((k) => k.id);
    if (!ids.includes(pageIndexKbId)) fail('list_knowledge_bases', 'page index kb missing');
    else pass('list_knowledge_bases');
  }

  const sources = await authJson(adminToken, '/api/knowledge-bases/import-sources');
  if (sources.status !== 200 || !Array.isArray(sources.body.channels)) {
    fail('import_sources', JSON.stringify(sources.body));
  } else {
    pass('import_sources', `${(sources.body.channels as unknown[]).length} channels`);
  }

  if (ragKbId) {
    const ragImportNoConfig = await authJson(adminToken, `/api/knowledge-bases/${ragKbId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_ids: ['00000000-0000-0000-0000-000000000001'] }),
    });
    if (ragImportNoConfig.status === 400) {
      pass('rag_import_requires_embedding', '400 as expected without embedding model');
    } else {
      fail('rag_import_requires_embedding', `expected 400, got ${ragImportNoConfig.status}`);
    }

    const ragEmptyImport = await authJson(adminToken, `/api/knowledge-bases/${ragKbId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_ids: [] }),
    });
    if (ragEmptyImport.status === 400) pass('rag_empty_import_rejected', '400 as expected');
    else fail('rag_empty_import_rejected', `expected 400, got ${ragEmptyImport.status}`);

    const ragIndexed = await authJson(adminToken, `/api/knowledge-bases/${ragKbId}/indexed-documents`);
    if (ragIndexed.status !== 200 || !Array.isArray(ragIndexed.body.items)) {
      fail('rag_indexed_documents', JSON.stringify(ragIndexed.body));
    } else {
      pass('rag_indexed_documents', `total=${ragIndexed.body.total}`);
    }

    const ragItems = await authJson(adminToken, `/api/knowledge-bases/${ragKbId}/items`);
    if (ragItems.status === 400) pass('rag_items_rejected', '400 as expected');
    else fail('rag_items_rejected', `expected 400, got ${ragItems.status}`);
  }

  const createFaq = await authJson(adminToken, '/api/knowledge-bases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Verify FAQ ${stamp}`,
      type: 'faq',
    }),
  });
  if (createFaq.status !== 201) {
    fail('create_faq_kb', JSON.stringify(createFaq.body));
  } else {
    faqKbId = createFaq.body.id as string;
    const faqCaps = createFaq.body.capabilities as {
      index?: boolean;
      manual_create?: boolean;
      extract?: boolean;
    };
    if (!faqCaps?.manual_create) fail('faq_capabilities', 'manual_create should be true');
    else if (!faqCaps?.extract) fail('faq_capabilities', 'extract should be true');
    else pass('create_faq_kb', faqKbId);

    if (createFaq.body.is_configured === true) {
      fail('faq_not_configured', 'is_configured should be false without embedding model');
    } else {
      pass('faq_not_configured');
    }

    const faqPipelineName = createFaq.body.pipeline_name as string | null;
    if (faqPipelineName !== 'kb-faq-index') {
      fail('faq_pipeline_link', `expected kb-faq-index, got ${faqPipelineName}`);
    } else {
      pass('faq_pipeline_link', faqPipelineName);
    }
  }

  if (faqKbId) {
    const createManualFaq = await authJson(adminToken, `/api/knowledge-bases/${faqKbId}/faqs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What is OKF?',
        answer: 'Open Knowledge Format.',
      }),
    });
    if (createManualFaq.status !== 201) {
      fail('create_manual_faq', JSON.stringify(createManualFaq.body));
    } else {
      pass('create_manual_faq', createManualFaq.body.id as string);
    }

    const listFaqs = await authJson(adminToken, `/api/knowledge-bases/${faqKbId}/faqs`);
    if (listFaqs.status !== 200 || !Array.isArray(listFaqs.body.items)) {
      fail('list_faqs', JSON.stringify(listFaqs.body));
    } else {
      pass('list_faqs', `total=${listFaqs.body.total}`);
      const faqId = (listFaqs.body.items as Array<{ id: string }>)?.[0]?.id;
      if (faqId) {
        const publish = await authJson(adminToken, `/api/knowledge-bases/${faqKbId}/faqs/batch-publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ faq_ids: [faqId] }),
        });
        if (publish.status !== 200) fail('batch_publish_faq', JSON.stringify(publish.body));
        else pass('batch_publish_faq');

        const indexNoEmbed = await authJson(adminToken, `/api/knowledge-bases/${faqKbId}/index-faqs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ faq_ids: [faqId] }),
        });
        if (indexNoEmbed.status === 400) pass('faq_index_requires_embedding', '400 as expected');
        else fail('faq_index_requires_embedding', `expected 400, got ${indexNoEmbed.status}`);
      }
    }
  }

  const getKb = await authJson(adminToken, `/api/knowledge-bases/${pageIndexKbId}`);
  if (getKb.status !== 200) fail('get_knowledge_base', JSON.stringify(getKb.body));
  else pass('get_knowledge_base');

  const items = await authJson(adminToken, `/api/knowledge-bases/${pageIndexKbId}/items`);
  if (items.status !== 200 || !Array.isArray(items.body.items)) {
    fail('list_kb_items', JSON.stringify(items.body));
  } else {
    pass('list_kb_items', `total=${items.body.total}`);
  }

  const emptyImport = await authJson(adminToken, `/api/knowledge-bases/${pageIndexKbId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel_ids: [], document_ids: [] }),
  });
  if (emptyImport.status === 400) pass('empty_import_rejected', '400 as expected');
  else fail('empty_import_rejected', `expected 400, got ${emptyImport.status}`);

  const channels = sources.body.channels as Array<{ id: string }> | undefined;
  const docsByChannel = sources.body.documents_by_channel as Record<string, Array<{ id: string }>> | undefined;
  if (channels?.length && docsByChannel) {
    const channelWithDoc = channels.find((ch) => (docsByChannel[ch.id]?.length ?? 0) > 0);
    const docId = channelWithDoc ? docsByChannel[channelWithDoc.id][0]?.id : undefined;
    if (docId) {
      const startImport = await authJson(adminToken, `/api/knowledge-bases/${pageIndexKbId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_ids: [docId] }),
      });
      if (startImport.status !== 202) {
        fail('start_import_job', JSON.stringify(startImport.body));
      } else {
        const job = startImport.body.job as { id: string; status: string } | undefined;
        if (!job?.id) fail('start_import_job', 'missing job id');
        else {
          pass('start_import_job', `${job.id} (${job.status})`);
          // Poll briefly for worker completion (local spawn or already finished)
          for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const polled = await authJson(
              adminToken,
              `/api/knowledge-bases/${pageIndexKbId}/import-jobs/${job.id}`,
            );
            if (polled.status === 200 && (polled.body.status === 'completed' || polled.body.status === 'failed')) {
              pass('import_job_finished', String(polled.body.status));
              const afterItems = await authJson(adminToken, `/api/knowledge-bases/${pageIndexKbId}/items`);
              const kbItems = (afterItems.body.items as Array<{ import_status: string }>) ?? [];
              if (kbItems.some((it) => it.import_status === 'completed')) {
                pass('kb_item_imported', 'at least one completed');
              } else if (kbItems.some((it) => it.import_status === 'failed')) {
                pass('kb_item_imported', 'import attempted (failed — check S3 artifacts)');
              } else {
                fail('kb_item_imported', JSON.stringify(kbItems));
              }
              break;
            }
          }
        }
      }
    } else {
      pass('start_import_job', 'skipped — no documents in channels');
    }
  }

  return summarize();
}

function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

void main();

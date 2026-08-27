#!/usr/bin/env node
/**
 * One-shot domain folder reorg for src/shared and src/services.
 * Usage: node scripts/reorganize-backend-domains.mjs [--fix-imports-only]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');

/** @type {Record<string, string>} oldPath -> newPath (relative to src/) */
const MOVES = {
  // shared/eval
  'shared/eval-judge-constants.ts': 'shared/eval/eval-judge-constants.ts',
  'shared/eval-judge-scenario-store.ts': 'shared/eval/eval-judge-scenario-store.ts',
  'shared/eval-judge-workflow.ts': 'shared/eval/eval-judge-workflow.ts',
  'shared/eval-judge-workflow.test.ts': 'shared/eval/eval-judge-workflow.test.ts',
  // shared/kb
  'shared/faq-index-yaml.ts': 'shared/kb/faq-index-yaml.ts',
  'shared/faq-index-yaml.test.ts': 'shared/kb/faq-index-yaml.test.ts',
  'shared/faq-index-workflow.ts': 'shared/kb/faq-index-workflow.ts',
  'shared/faq-pipeline-binding.ts': 'shared/kb/faq-pipeline-binding.ts',
  'shared/kb-chunk-embedding.ts': 'shared/kb/kb-chunk-embedding.ts',
  'shared/kb-chunk-embedding.test.ts': 'shared/kb/kb-chunk-embedding.test.ts',
  'shared/kb-faq-metadata.ts': 'shared/kb/kb-faq-metadata.ts',
  'shared/kb-faq-metadata.test.ts': 'shared/kb/kb-faq-metadata.test.ts',
  'shared/kb-import-limits.ts': 'shared/kb/kb-import-limits.ts',
  'shared/kb-pipeline-binding.ts': 'shared/kb/kb-pipeline-binding.ts',
  'shared/rag-index-yaml.ts': 'shared/kb/rag-index-yaml.ts',
  'shared/rag-index-yaml.test.ts': 'shared/kb/rag-index-yaml.test.ts',
  'shared/rag-index-workflow.ts': 'shared/kb/rag-index-workflow.ts',
  'shared/rag-pipeline-binding.ts': 'shared/kb/rag-pipeline-binding.ts',
  // shared/pipeline
  'shared/audio-pipeline-binding.ts': 'shared/pipeline/audio-pipeline-binding.ts',
  'shared/audio-transcribe-workflow.ts': 'shared/pipeline/audio-transcribe-workflow.ts',
  'shared/cli-workflow-defaults.ts': 'shared/pipeline/cli-workflow-defaults.ts',
  'shared/cli-workflow-defaults.test.ts': 'shared/pipeline/cli-workflow-defaults.test.ts',
  'shared/pipeline-catalog.ts': 'shared/pipeline/pipeline-catalog.ts',
  'shared/pipeline-command-template.ts': 'shared/pipeline/pipeline-command-template.ts',
  'shared/pipeline-command-template.kb.test.ts': 'shared/pipeline/pipeline-command-template.kb.test.ts',
  'shared/pipeline-config-store.ts': 'shared/pipeline/pipeline-config-store.ts',
  'shared/pipeline-config-yaml.ts': 'shared/pipeline/pipeline-config-yaml.ts',
  'shared/pipeline-config-yaml.test.ts': 'shared/pipeline/pipeline-config-yaml.test.ts',
  // shared/model
  'shared/agent-instance-id.ts': 'shared/model/agent-instance-id.ts',
  'shared/agent-instance-id.test.ts': 'shared/model/agent-instance-id.test.ts',
  'shared/embedding-provider.ts': 'shared/model/embedding-provider.ts',
  'shared/embedding-provider.test.ts': 'shared/model/embedding-provider.test.ts',
  'shared/model-cli-client.ts': 'shared/model/model-cli-client.ts',
  'shared/model-config-secret.ts': 'shared/model/model-config-secret.ts',
  'shared/model-config-secret.test.ts': 'shared/model/model-config-secret.test.ts',
  'shared/model-config-store.ts': 'shared/model/model-config-store.ts',
  'shared/model-flue-binding.ts': 'shared/model/model-flue-binding.ts',
  'shared/model-flue-binding.test.ts': 'shared/model/model-flue-binding.test.ts',
  'shared/model-qwen-catalog-overlay.ts': 'shared/model/model-qwen-catalog-overlay.ts',
  'shared/model-qwen-catalog-overlay.test.ts': 'shared/model/model-qwen-catalog-overlay.test.ts',
  'shared/model-registry.ts': 'shared/model/model-registry.ts',
  'shared/models.ts': 'shared/model/models.ts',
  'shared/resolve-agent-model.ts': 'shared/model/resolve-agent-model.ts',
  'shared/resolve-agent-model.test.ts': 'shared/model/resolve-agent-model.test.ts',
  'shared/resolve-agent-thinking-level.ts': 'shared/model/resolve-agent-thinking-level.ts',
  'shared/thinking-level.ts': 'shared/model/thinking-level.ts',
  'shared/thinking-level.test.ts': 'shared/model/thinking-level.test.ts',
  // shared/session
  'shared/publish-artifact-tools.ts': 'shared/session/publish-artifact-tools.ts',
  'shared/publish-artifact-tools.test.ts': 'shared/session/publish-artifact-tools.test.ts',
  'shared/session-file-extract.ts': 'shared/session/session-file-extract.ts',
  'shared/session-file-extract.test.ts': 'shared/session/session-file-extract.test.ts',
  'shared/session-file-image-extract.ts': 'shared/session/session-file-image-extract.ts',
  'shared/session-file-read.ts': 'shared/session/session-file-read.ts',
  'shared/session-file-read.test.ts': 'shared/session/session-file-read.test.ts',
  'shared/session-file-search.ts': 'shared/session/session-file-search.ts',
  'shared/session-file-tools.ts': 'shared/session/session-file-tools.ts',
  // shared/lib
  'shared/outbound-fetch.ts': 'shared/lib/outbound-fetch.ts',
  'shared/outbound-fetch.test.ts': 'shared/lib/outbound-fetch.test.ts',

  // services/eval
  'services/eval-audio-bridge.ts': 'services/eval/eval-audio-bridge.ts',
  'services/eval-dataset-db-error.ts': 'services/eval/eval-dataset-db-error.ts',
  'services/eval-datasets.ts': 'services/eval/eval-datasets.ts',
  'services/eval-datasets-upload.test.ts': 'services/eval/eval-datasets-upload.test.ts',
  'services/eval-judge-dimensions.ts': 'services/eval/eval-judge-dimensions.ts',
  'services/eval-judge-dimensions.test.ts': 'services/eval/eval-judge-dimensions.test.ts',
  'services/eval-judge-jobs.ts': 'services/eval/eval-judge-jobs.ts',
  'services/eval-judge-runner.ts': 'services/eval/eval-judge-runner.ts',
  'services/eval-pipeline-github-actions.ts': 'services/eval/eval-pipeline-github-actions.ts',
  'services/eval-pipeline-jobs.ts': 'services/eval/eval-pipeline-jobs.ts',
  'services/eval-pipeline-runner.ts': 'services/eval/eval-pipeline-runner.ts',
  'services/eval-pipeline-runner.test.ts': 'services/eval/eval-pipeline-runner.test.ts',
  'services/eval-run-attempts.ts': 'services/eval/eval-run-attempts.ts',
  'services/eval-run-compare.ts': 'services/eval/eval-run-compare.ts',
  'services/eval-run-dispatch.ts': 'services/eval/eval-run-dispatch.ts',
  'services/eval-run-dispatch.test.ts': 'services/eval/eval-run-dispatch.test.ts',
  'services/eval-run-dispatch-group.ts': 'services/eval/eval-run-dispatch-group.ts',
  'services/eval-run-item-enrichment.ts': 'services/eval/eval-run-item-enrichment.ts',
  'services/eval-run-judge.ts': 'services/eval/eval-run-judge.ts',
  'services/eval-run-phase.ts': 'services/eval/eval-run-phase.ts',
  'services/eval-run-phase.test.ts': 'services/eval/eval-run-phase.test.ts',
  'services/eval-runs.ts': 'services/eval/eval-runs.ts',
  'services/eval-shadow-audio.ts': 'services/eval/eval-shadow-audio.ts',
  // services/kb
  'services/kb-chunk-documents.ts': 'services/kb/kb-chunk-documents.ts',
  'services/kb-chunks.ts': 'services/kb/kb-chunks.ts',
  'services/kb-faq-llm.ts': 'services/kb/kb-faq-llm.ts',
  'services/kb-faqs.ts': 'services/kb/kb-faqs.ts',
  'services/kb-import-github-actions.ts': 'services/kb/kb-import-github-actions.ts',
  'services/kb-import-github-actions.test.ts': 'services/kb/kb-import-github-actions.test.ts',
  'services/kb-import-runner.ts': 'services/kb/kb-import-runner.ts',
  'services/kb-import-worker-mode.ts': 'services/kb/kb-import-worker-mode.ts',
  'services/kb-import-worker-mode.test.ts': 'services/kb/kb-import-worker-mode.test.ts',
  'services/knowledge-bases.ts': 'services/kb/knowledge-bases.ts',
  // services/pipeline
  'services/auto-audio-pipeline.ts': 'services/pipeline/auto-audio-pipeline.ts',
  'services/auto-pipeline.ts': 'services/pipeline/auto-pipeline.ts',
  'services/pipeline-github-actions.ts': 'services/pipeline/pipeline-github-actions.ts',
  'services/pipeline-github-actions.test.ts': 'services/pipeline/pipeline-github-actions.test.ts',
  'services/pipeline-jobs.ts': 'services/pipeline/pipeline-jobs.ts',
  'services/pipeline-poller.ts': 'services/pipeline/pipeline-poller.ts',
  'services/pipeline-runner.ts': 'services/pipeline/pipeline-runner.ts',
  'services/pipeline-worker-mode.ts': 'services/pipeline/pipeline-worker-mode.ts',
  // services/audio
  'services/asr-hotword-validation.ts': 'services/audio/asr-hotword-validation.ts',
  'services/asr-hotword-validation.test.ts': 'services/audio/asr-hotword-validation.test.ts',
  'services/asr-hotwords.ts': 'services/audio/asr-hotwords.ts',
  'services/asr-vocabulary-sync.ts': 'services/audio/asr-vocabulary-sync.ts',
  'services/audio-capture-pipeline-github-actions.ts': 'services/audio/audio-capture-pipeline-github-actions.ts',
  'services/audio-capture-pipeline-github-actions.test.ts': 'services/audio/audio-capture-pipeline-github-actions.test.ts',
  'services/audio-capture-pipeline-jobs.ts': 'services/audio/audio-capture-pipeline-jobs.ts',
  'services/audio-capture-pipeline-runner.ts': 'services/audio/audio-capture-pipeline-runner.ts',
  'services/audio-pipeline-github-actions.ts': 'services/audio/audio-pipeline-github-actions.ts',
  'services/audio-pipeline-github-actions.test.ts': 'services/audio/audio-pipeline-github-actions.test.ts',
  'services/audio-pipeline-jobs.ts': 'services/audio/audio-pipeline-jobs.ts',
  'services/audio-pipeline-names.ts': 'services/audio/audio-pipeline-names.ts',
  'services/audio-pipeline-names.test.ts': 'services/audio/audio-pipeline-names.test.ts',
  'services/audio-pipeline-reconcile.ts': 'services/audio/audio-pipeline-reconcile.ts',
  'services/audio-pipeline-runner.ts': 'services/audio/audio-pipeline-runner.ts',
  'services/audio-pipeline-stale.ts': 'services/audio/audio-pipeline-stale.ts',
  'services/audio-pipeline-stale.test.ts': 'services/audio/audio-pipeline-stale.test.ts',
  'services/audios.ts': 'services/audio/audios.ts',
  // services/capture
  'services/audio-captures.ts': 'services/capture/audio-captures.ts',
  'services/capture-audio-upload.ts': 'services/capture/capture-audio-upload.ts',
  'services/capture-audio-upload.test.ts': 'services/capture/capture-audio-upload.test.ts',
  'services/capture-post-process-pipeline-names.ts': 'services/capture/capture-post-process-pipeline-names.ts',
  'services/capture-post-process-trigger.ts': 'services/capture/capture-post-process-trigger.ts',
  'services/capture-readiness.ts': 'services/capture/capture-readiness.ts',
  'services/capture-readiness.test.ts': 'services/capture/capture-readiness.test.ts',
  'services/capture-status.ts': 'services/capture/capture-status.ts',
  'services/capture-status.test.ts': 'services/capture/capture-status.test.ts',
  'services/capture-status-resolve.ts': 'services/capture/capture-status-resolve.ts',
  'services/capture-transcript-normalize.ts': 'services/capture/capture-transcript-normalize.ts',
  'services/capture-transcript-upload.ts': 'services/capture/capture-transcript-upload.ts',
  'services/capture-transcript-upload.test.ts': 'services/capture/capture-transcript-upload.test.ts',
  'services/capture-transcript-upload.direct.test.ts': 'services/capture/capture-transcript-upload.direct.test.ts',
  // services/documents
  'services/document-metadata-extraction.ts': 'services/documents/document-metadata-extraction.ts',
  'services/document-metadata-extraction.test.ts': 'services/documents/document-metadata-extraction.test.ts',
  'services/document-upload.ts': 'services/documents/document-upload.ts',
  'services/document-upload.test.ts': 'services/documents/document-upload.test.ts',
  'services/documents.ts': 'services/documents/documents.ts',
  // services/models
  'services/model-chat-completions.ts': 'services/models/model-chat-completions.ts',
  'services/model-chat-completions.test.ts': 'services/models/model-chat-completions.test.ts',
  'services/model-cli-params.ts': 'services/models/model-cli-params.ts',
  // services/channels
  'services/channel-tree.ts': 'services/channels/channel-tree.ts',
  'services/channel-tree.test.ts': 'services/channels/channel-tree.test.ts',
  // services/session
  'services/session-file-upload.ts': 'services/session/session-file-upload.ts',
  'services/session-files-cleanup.ts': 'services/session/session-files-cleanup.ts',
};

const reverseMoves = Object.fromEntries(Object.entries(MOVES).map(([from, to]) => [to, from]));

function normalizeSrcPath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const fromDir = path.dirname(fromFile);
  const abs = path.normalize(path.join(fromDir, specifier));
  const rel = normalizeSrcPath(path.relative(srcRoot, abs));
  return rel;
}

function toPosixRelative(fromFile, targetRel) {
  const rel = path.relative(path.dirname(fromFile), path.join(srcRoot, targetRel));
  let posix = normalizeSrcPath(rel);
  if (!posix.startsWith('.')) posix = `./${posix}`;
  return posix;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function remapTarget(relPath) {
  if (MOVES[relPath]) return MOVES[relPath];
  return relPath;
}

function fixImports() {
  const files = walk(srcRoot).concat(walk(path.join(root, 'scripts')));
  const importRe = /(from\s+['"]|import\s*\(\s*['"])(\.[^'"]+\.ts)(['"])/g;
  let changedFiles = 0;

  for (const file of files) {
    if (file.includes('reorganize-backend-domains.mjs')) continue;
    const original = fs.readFileSync(file, 'utf8');
    let changed = false;
    const updated = original.replace(importRe, (match, prefix, specifier, suffix) => {
      const resolved = resolveImport(file, specifier);
      if (!resolved) return match;
      const remapped = remapTarget(resolved);
      if (remapped === resolved) return match;
      const newSpecifier = toPosixRelative(file, remapped);
      changed = true;
      return `${prefix}${newSpecifier}${suffix}`;
    });
    if (changed) {
      fs.writeFileSync(file, updated);
      changedFiles += 1;
    }
  }
  console.log(`Updated imports in ${changedFiles} files`);
}

function gitMoveFiles() {
  for (const [from, to] of Object.entries(MOVES)) {
    const fromAbs = path.join(srcRoot, from);
    const toAbs = path.join(srcRoot, to);
    if (!fs.existsSync(fromAbs)) {
      if (fs.existsSync(toAbs)) continue;
      throw new Error(`Missing source file: ${from}`);
    }
    fs.mkdirSync(path.dirname(toAbs), { recursive: true });
    execSync(`git mv "${fromAbs}" "${toAbs}"`, { cwd: root, stdio: 'inherit' });
  }
  console.log(`Moved ${Object.keys(MOVES).length} files`);
}

const fixOnly = process.argv.includes('--fix-imports-only');
if (!fixOnly) gitMoveFiles();
fixImports();

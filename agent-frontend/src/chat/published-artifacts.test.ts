import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArtifactHrefResolver,
  isAgentAttachmentDownloadHref,
  rewritePublishedArtifactMarkdownLinks,
} from './published-artifacts.ts';

test('isAgentAttachmentDownloadHref detects relative and absolute attachment URLs', () => {
  assert.equal(
    isAgentAttachmentDownloadHref(
      '/api/agents/content-studio/user--c/attachments/att-1?token=abc',
    ),
    true,
  );
  assert.equal(
    isAgentAttachmentDownloadHref('https://api.example.com/api/agents/a/b/attachments/c?token=t'),
    true,
  );
  assert.equal(isAgentAttachmentDownloadHref('/agents/playground'), false);
});

test('buildArtifactHrefResolver maps bare filenames and link labels to publish_artifact URLs', () => {
  const attachmentPath = '/api/agents/content-studio/user--c/attachments/att-1?token=t';
  const resolve = buildArtifactHrefResolver([
    { filename: '悯农-presentation.html', downloadUrl: attachmentPath },
  ]);

  assert.equal(resolve('presentation.html'), attachmentPath);
  assert.equal(resolve('悯农-presentation.html'), attachmentPath);
  assert.equal(resolve('other.html', '悯农-presentation.html'), attachmentPath);
});

test('buildArtifactHrefResolver uses sole artifact for any bare filename', () => {
  const attachmentPath = '/api/agents/a/b/attachments/only?token=x';
  const resolve = buildArtifactHrefResolver([
    { filename: 'deck.html', downloadUrl: attachmentPath },
  ]);
  assert.equal(resolve('anything.html'), attachmentPath);
});

test('rewritePublishedArtifactMarkdownLinks rewrites markdown file links to attachment URLs', () => {
  const attachmentPath = '/api/agents/a/b/attachments/att?token=x';
  const filename = '悯农-国风卷轴版-2页-html-ppt.html';
  const artifacts = [{ filename, downloadUrl: attachmentPath }];
  const source = `下载链接：\n- [${filename}](${filename})`;
  const rewritten = rewritePublishedArtifactMarkdownLinks(source, artifacts);
  assert.equal(
    rewritten,
    `下载链接：\n- [${filename}](${attachmentPath})`,
  );
  assert.equal(isAgentAttachmentDownloadHref(attachmentPath), true);
});

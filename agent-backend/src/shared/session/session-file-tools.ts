import { defineTool, type ToolDefinition } from '@flue/runtime';
import * as v from 'valibot';
import { getAgentRequestContext } from '../../flue/agent-request-context.ts';
import { readSessionFileText } from './session-file-read.ts';
import { searchSessionFiles } from './session-file-search.ts';
import { listSessionFileItems, toListItem } from '../../storage/session-files/session-file-service.ts';
import { listSessionFilesForInstance } from '../../storage/session-files/repository.ts';

function requireInstanceId(): string {
  const instanceId = getAgentRequestContext()?.instanceId?.trim();
  if (!instanceId) {
    throw new Error('Session file tools require an active agent instance context.');
  }
  return instanceId;
}

const readOutputSchema = v.object({
  fileId: v.string(),
  filename: v.string(),
  mimeType: v.string(),
  offset: v.number(),
  returnedChars: v.number(),
  totalChars: v.number(),
  truncated: v.boolean(),
  nextOffset: v.optional(v.number()),
  warnings: v.optional(v.array(v.string())),
  text: v.string(),
});

const listOutputSchema = v.object({
  files: v.array(
    v.object({
      fileId: v.string(),
      filename: v.string(),
      mimeType: v.string(),
      sizeBytes: v.number(),
      hasContentCache: v.boolean(),
      createdAt: v.string(),
    }),
  ),
});

const searchOutputSchema = v.object({
  hits: v.array(
    v.object({
      fileId: v.string(),
      filename: v.string(),
      line: v.number(),
      excerpt: v.string(),
    }),
  ),
});

export function createSessionFileTools(): ToolDefinition[] {
  const listSessionFiles = defineTool({
    name: 'list_session_files',
    description:
      'List document attachments uploaded to the current chat session (fileId, filename, size). Use before read_session_file.',
    input: v.object({}),
    output: listOutputSchema,
    async run() {
      const instanceId = requireInstanceId();
      const files = await listSessionFileItems(instanceId);
      return { files };
    },
  });

  const readSessionFile = defineTool({
    name: 'read_session_file',
    description:
      'Read extracted text from a session document attachment by fileId. Supports offset/limit for large files.',
    input: v.object({
      fileId: v.pipe(v.string(), v.description('Session file id from list_session_files or message manifest')),
      offset: v.optional(v.pipe(v.number(), v.description('Character offset (default 0)'))),
      limit: v.optional(v.pipe(v.number(), v.description('Max characters to return'))),
    }),
    output: readOutputSchema,
    async run({ input }) {
      const instanceId = requireInstanceId();
      return readSessionFileText({
        instanceId,
        fileId: input.fileId,
        offset: input.offset,
        limit: input.limit,
      });
    },
  });

  const searchSessionFilesTool = defineTool({
    name: 'search_session_files',
    description:
      'Keyword search across session document attachments. Returns matching line excerpts with fileId and line number.',
    input: v.object({
      query: v.pipe(v.string(), v.description('Case-insensitive keyword')),
      limit: v.optional(v.pipe(v.number(), v.description('Max hits (default 20)'))),
    }),
    output: searchOutputSchema,
    async run({ input }) {
      const instanceId = requireInstanceId();
      const hits = await searchSessionFiles({
        instanceId,
        query: input.query,
        limit: input.limit,
      });
      return { hits };
    },
  });

  return [listSessionFiles, readSessionFile, searchSessionFilesTool];
}

/** @internal test helper */
export async function listSessionFilesRaw(instanceId: string) {
  const records = await listSessionFilesForInstance(instanceId);
  return records.map(toListItem);
}

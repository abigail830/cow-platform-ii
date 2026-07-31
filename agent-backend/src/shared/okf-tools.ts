import { defineTool, type ToolDefinition } from '@flue/runtime';
import * as v from 'valibot';
import { createBundleAccessor, resolveOkfBundleRoot } from './okf-bundle.ts';
import type { OkfBundleRef } from './okf-bundle-ref.ts';

const okfToolOutput = v.union([
  v.record(v.string(), v.unknown()),
  v.array(v.unknown()),
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
]);

export function createOkfTools(options: { bundle: OkfBundleRef }): ToolDefinition[] {
  const bundle = createBundleAccessor(resolveOkfBundleRoot(options.bundle));

  const okfRead = defineTool({
    name: 'okf_read',
    description:
      'Read one OKF concept by bundle-relative path (e.g. templates/sg-incorp or playbooks/catalog-search-and-matching).',
    input: v.object({
      path: v.pipe(v.string(), v.description('Concept path without .md')),
    }),
    output: okfToolOutput,
    async run({ input }) {
      return bundle.readConcept(input.path);
    },
  });

  const okfSearch = defineTool({
    name: 'okf_search',
    description: 'Keyword search across OKF bundle markdown files.',
    input: v.object({
      query: v.pipe(v.string(), v.description('Search keywords')),
      limit: v.optional(v.pipe(v.number(), v.description('Max results (default 12)'))),
    }),
    output: okfToolOutput,
    async run({ input }) {
      return bundle.searchConcepts(input.query, input.limit ?? 12);
    },
  });

  const okfListConcepts = defineTool({
    name: 'okf_list_concepts',
    description: 'List concepts under an optional directory prefix.',
    input: v.object({
      prefix: v.optional(v.pipe(v.string(), v.description('Directory prefix, e.g. templates'))),
      limit: v.optional(v.pipe(v.number(), v.description('Max results (default 80)'))),
    }),
    output: okfToolOutput,
    async run({ input }) {
      return bundle.listConcepts(input.prefix ?? '', input.limit ?? 80);
    },
  });

  const okfTemplateSections = defineTool({
    name: 'okf_template_sections',
    description: 'Parse template sections[] from a Proposal Template concept.',
    input: v.object({
      template_id: v.pipe(v.string(), v.description('Template id, e.g. sg-incorp')),
    }),
    output: okfToolOutput,
    async run({ input }) {
      return bundle.templateSections(input.template_id);
    },
  });

  return [okfRead, okfSearch, okfListConcepts, okfTemplateSections];
}

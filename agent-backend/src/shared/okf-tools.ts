import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { listConcepts, readConcept, searchConcepts, templateSections } from './okf-bundle.ts';

export const okfRead = defineTool({
  name: 'okf_read',
  description: 'Read one OKF concept by bundle-relative path (e.g. templates/sg-incorp or playbooks/catalog-search-and-matching).',
  input: v.object({
    path: v.pipe(v.string(), v.description('Concept path without .md')),
  }),
  output: v.unknown(),
  async run({ input }) {
    return readConcept(input.path);
  },
});

export const okfSearch = defineTool({
  name: 'okf_search',
  description: 'Keyword search across OKF bundle markdown files.',
  input: v.object({
    query: v.pipe(v.string(), v.description('Search keywords')),
    limit: v.optional(v.pipe(v.number(), v.description('Max results (default 12)'))),
  }),
  output: v.unknown(),
  async run({ input }) {
    return searchConcepts(input.query, input.limit ?? 12);
  },
});

export const okfListConcepts = defineTool({
  name: 'okf_list_concepts',
  description: 'List concepts under an optional directory prefix.',
  input: v.object({
    prefix: v.optional(v.pipe(v.string(), v.description('Directory prefix, e.g. templates'))),
    limit: v.optional(v.pipe(v.number(), v.description('Max results (default 80)'))),
  }),
  output: v.unknown(),
  async run({ input }) {
    return listConcepts(input.prefix ?? '', input.limit ?? 80);
  },
});

export const okfTemplateSections = defineTool({
  name: 'okf_template_sections',
  description: 'Parse template sections[] from a Proposal Template concept.',
  input: v.object({
    template_id: v.pipe(v.string(), v.description('Template id, e.g. sg-incorp')),
  }),
  output: v.unknown(),
  async run({ input }) {
    return templateSections(input.template_id);
  },
});

export const okfTools = [okfRead, okfSearch, okfListConcepts, okfTemplateSections];

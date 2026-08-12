/** Published E2B template aliases owned by the platform (not per-agent). */
export const E2B_PLATFORM_TEMPLATES = {
  /** docx / pptx / html-slides toolchain (LibreOffice, pandoc, markitdown, pptxgenjs, …) */
  contentStudio: 'okf-content-studio',
} as const;

export type E2bPlatformTemplateId =
  (typeof E2B_PLATFORM_TEMPLATES)[keyof typeof E2B_PLATFORM_TEMPLATES];

const DEFAULT_CONTENT_STUDIO_TAG = '1.9';

export function readContentStudioTemplateAlias(): string {
  return process.env.E2B_CONTENT_STUDIO_TEMPLATE?.trim() || E2B_PLATFORM_TEMPLATES.contentStudio;
}

export function readContentStudioTemplateTag(): string {
  return process.env.E2B_CONTENT_STUDIO_TEMPLATE_TAG?.trim() || DEFAULT_CONTENT_STUDIO_TAG;
}

/** Full `alias:tag` ref for Content Studio (matches `e2b-templates/content-studio/build.ts`). */
export function contentStudioTemplateRef(): string {
  return `${readContentStudioTemplateAlias()}:${readContentStudioTemplateTag()}`;
}

/**
 * E2B resolves bare aliases to tag `default`. Our templates are published with an explicit tag
 * (default `1.9`), so bare ids like `okf-content-studio` must be expanded before Sandbox.create.
 */
export function resolveE2bTemplateRef(templateId: string): string {
  const id = templateId.trim();
  if (!id || id.includes(':')) return id;

  const contentStudioAlias = readContentStudioTemplateAlias();
  if (id === contentStudioAlias || id === E2B_PLATFORM_TEMPLATES.contentStudio) {
    return `${id}:${readContentStudioTemplateTag()}`;
  }

  return id;
}

import type { ReactNode } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { isExternalHttpUrl, parseSourcePreviewHref } from '../shared/source-preview-href.ts';
import { slugifyHeading } from './PageIndexTree.tsx';

type MarkdownProps = {
  children?: string;
  content?: string;
  headingIds?: boolean;
  /** Merge with built-in renderers (e.g. document parsed-image presign). */
  components?: Components;
};

function headingIdFromChildren(children: ReactNode): string | undefined {
  const text = extractText(children).trim();
  return text ? slugifyHeading(text) : undefined;
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return extractText(props?.children ?? '');
  }
  return '';
}

function buildMarkdownComponents(headingIds: boolean, extra?: Components): Components {
  const link = ({ href, children, ...props }: { href?: string; children?: ReactNode }) => {
    if (href && isExternalHttpUrl(href)) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    }

    const previewTarget = href ? parseSourcePreviewHref(href) : null;
    const internal = href?.startsWith('/') && !href.startsWith('/api/');
    return (
      <a
        href={href}
        target={internal ? undefined : href ? '_blank' : undefined}
        rel={internal ? undefined : href ? 'noopener noreferrer' : undefined}
        data-source-preview={previewTarget ? 'true' : undefined}
        {...props}
      >
        {children}
      </a>
    );
  };

  if (!headingIds) {
    return {
      a: link,
      table: ({ children, ...props }) => (
        <div className="md-table-wrap">
          <table {...props}>{children}</table>
        </div>
      ),
      ...extra,
    };
  }

  const heading =
    (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
    ({ children, ...props }: { children?: ReactNode }) => {
      const id = headingIdFromChildren(children);
      return (
        <Tag id={id} {...props}>
          {children}
        </Tag>
      );
    };

  return {
    a: link,
    table: ({ children, ...props }) => (
      <div className="md-table-wrap">
        <table {...props}>{children}</table>
      </div>
    ),
    h1: heading('h1'),
    h2: heading('h2'),
    h3: heading('h3'),
    h4: heading('h4'),
    h5: heading('h5'),
    h6: heading('h6'),
    ...extra,
  };
}

export function Markdown({ children, content, headingIds = false, components }: MarkdownProps) {
  const source = content ?? children ?? '';

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={headingIds ? [rehypeRaw] : []}
        components={buildMarkdownComponents(headingIds, components)}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

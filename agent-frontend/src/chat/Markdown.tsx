import type { ReactNode } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useChatLinkResolve } from './chat-link-resolve-context.ts';
import { useSourcePreviewHost } from './source-preview-host.tsx';
import { isExternalHttpUrl, parseSourcePreviewHref } from '../shared/source-preview-href.ts';
import { slugifyHeading } from '../components/PageIndexTree.tsx';

type MarkdownProps = {
  children?: string;
  content?: string;
  headingIds?: boolean;
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

function buildMarkdownComponents(
  headingIds: boolean,
  resolveLinkHref?: (href: string, label?: string) => string,
  openSourcePreview?: (target: { documentId: string; page: number | null; title?: string }) => void,
): Components {
  const link = ({ href, children, ...props }: { href?: string; children?: ReactNode }) => {
    const label = extractText(children).trim();
    const resolvedHref = href && resolveLinkHref ? resolveLinkHref(href, label || undefined) : href;

    if (resolvedHref && isExternalHttpUrl(resolvedHref)) {
      return (
        <a href={resolvedHref} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    }

    const previewTarget = resolvedHref ? parseSourcePreviewHref(resolvedHref) : null;
    if (previewTarget && openSourcePreview) {
      return (
        <a
          href={resolvedHref}
          onClick={(event) => {
            event.preventDefault();
            openSourcePreview({
              ...previewTarget,
              title: label || undefined,
            });
          }}
          {...props}
        >
          {children}
        </a>
      );
    }

    const internal = resolvedHref?.startsWith('/') ?? false;
    return (
      <a
        href={resolvedHref}
        target={internal ? undefined : '_blank'}
        rel={internal ? undefined : 'noopener noreferrer'}
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
    };
  }

  return {
    a: link,
    table: ({ children, ...props }) => (
      <div className="md-table-wrap">
        <table {...props}>{children}</table>
      </div>
    ),
    h1: ({ children, ...props }) => {
      const id = headingIdFromChildren(children);
      return (
        <h1 id={id} {...props}>
          {children}
        </h1>
      );
    },
    h2: ({ children, ...props }) => {
      const id = headingIdFromChildren(children);
      return (
        <h2 id={id} {...props}>
          {children}
        </h2>
      );
    },
    h3: ({ children, ...props }) => {
      const id = headingIdFromChildren(children);
      return (
        <h3 id={id} {...props}>
          {children}
        </h3>
      );
    },
    h4: ({ children, ...props }) => {
      const id = headingIdFromChildren(children);
      return (
        <h4 id={id} {...props}>
          {children}
        </h4>
      );
    },
    h5: ({ children, ...props }) => {
      const id = headingIdFromChildren(children);
      return (
        <h5 id={id} {...props}>
          {children}
        </h5>
      );
    },
    h6: ({ children, ...props }) => {
      const id = headingIdFromChildren(children);
      return (
        <h6 id={id} {...props}>
          {children}
        </h6>
      );
    },
  };
}

export function Markdown({ children, content, headingIds = false }: MarkdownProps) {
  const source = content ?? children ?? '';
  const resolveLinkHref = useChatLinkResolve();
  const previewHost = useSourcePreviewHost();
  const openSourcePreview = previewHost?.open;

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={headingIds ? [rehypeRaw] : []}
        components={buildMarkdownComponents(headingIds, resolveLinkHref, openSourcePreview)}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

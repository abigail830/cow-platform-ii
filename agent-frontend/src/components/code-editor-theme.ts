import { EditorView } from '@codemirror/view';

export const brandCodeEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.75rem',
  },
  '&.cm-editor': {
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: '#ffffff',
  },
  '&.cm-editor.cm-focused': {
    outline: 'none',
    borderColor: 'var(--brand-orange)',
    boxShadow: '0 0 0 1px var(--brand-orange)',
  },
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    lineHeight: '1.45',
  },
  '.cm-content': {
    padding: '0.55rem 0',
    caretColor: 'var(--brand-orange)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--brand-orange)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgba(255, 102, 17, 0.28) !important',
  },
  '.cm-content ::selection': {
    backgroundColor: 'rgba(255, 102, 17, 0.28)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 102, 17, 0.06)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255, 102, 17, 0.08)',
  },
  '.cm-gutters': {
    backgroundColor: '#f8fafc',
    color: '#94a3b8',
    borderRight: '1px solid #e2e8f0',
  },
});

/** Read-only preview — same shell as brand editor, without focus ring or active line. */
export const readOnlyCodeEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.75rem',
  },
  '&.cm-editor': {
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    background: '#ffffff',
  },
  '&.cm-editor.cm-focused': {
    outline: 'none',
    borderColor: '#e2e8f0',
    boxShadow: 'none',
  },
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    lineHeight: '1.45',
  },
  '.cm-content': {
    padding: '0.55rem 0',
    caretColor: 'transparent',
  },
  '.cm-gutters': {
    backgroundColor: '#f8fafc',
    color: '#94a3b8',
    borderRight: '1px solid #e2e8f0',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
});

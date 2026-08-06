import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { readOnlyCodeEditorTheme } from './code-editor-theme.ts';

export type ReadOnlyCodeLanguage = 'markdown' | 'yaml' | 'json' | 'python' | 'xml' | 'plain';

type ReadOnlyCodeEditorProps = {
  value: string;
  language?: ReadOnlyCodeLanguage;
  className?: string;
};

export function readOnlyCodeLanguageForPath(path: string): ReadOnlyCodeLanguage {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot + 1) : '';
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'json':
      return 'json';
    case 'py':
      return 'python';
    case 'xml':
    case 'xsd':
      return 'xml';
    default:
      return 'plain';
  }
}

function languageExtension(language: ReadOnlyCodeLanguage): Extension {
  switch (language) {
    case 'markdown':
      return markdown();
    case 'yaml':
      return yaml();
    case 'json':
      return json();
    case 'python':
      return python();
    case 'xml':
      return xml();
    default:
      return [];
  }
}

export function ReadOnlyCodeEditor({
  value,
  language = 'plain',
  className,
}: ReadOnlyCodeEditorProps) {
  return (
    <div className={className ? `read-only-code-editor ${className}` : 'read-only-code-editor'}>
      <CodeMirror
        value={value}
        height="100%"
        theme={readOnlyCodeEditorTheme}
        extensions={[
          languageExtension(language),
          EditorView.lineWrapping,
          EditorView.editable.of(false),
        ]}
        editable={false}
        readOnly
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
          bracketMatching: true,
          autocompletion: false,
        }}
      />
    </div>
  );
}

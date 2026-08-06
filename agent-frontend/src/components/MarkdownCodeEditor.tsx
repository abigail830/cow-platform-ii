import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { brandCodeEditorTheme } from './code-editor-theme.ts';

type MarkdownCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function MarkdownCodeEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  className,
}: MarkdownCodeEditorProps) {
  return (
    <div className={className ? `markdown-code-editor ${className}` : 'markdown-code-editor'}>
      <CodeMirror
        value={value}
        height="100%"
        theme={brandCodeEditorTheme}
        extensions={[markdown(), EditorView.lineWrapping]}
        editable={!disabled}
        readOnly={disabled}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightSelectionMatches: false,
          bracketMatching: true,
          autocompletion: false,
        }}
        placeholder={placeholder}
        onChange={onChange}
      />
    </div>
  );
}

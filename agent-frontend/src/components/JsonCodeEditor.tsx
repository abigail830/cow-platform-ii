import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import { brandCodeEditorTheme } from './code-editor-theme.ts';

type JsonCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function JsonCodeEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  className,
}: JsonCodeEditorProps) {
  return (
    <div className={className ? `json-code-editor ${className}` : 'json-code-editor'}>
      <CodeMirror
        value={value}
        height="100%"
        theme={brandCodeEditorTheme}
        extensions={[json(), EditorView.lineWrapping]}
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

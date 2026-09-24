// The XML the editor will write for the file, read-only. A file the parser
// refuses is shown as it is on disk, with the error, to be fixed elsewhere.

import { contentOf, type FileState } from '../store';

export function XmlView({ file }: { file: FileState }) {
  return (
    <div className="xml-view">
      {file.error && (
        <div className="banner error">
          This file cannot be parsed: {file.error.message}{file.error.line ? ` (line ${file.error.line})` : ''}.
          Fix it in a text editor, then reload the folder.
        </div>
      )}
      <textarea className="mono" value={contentOf(file)} readOnly spellCheck={false} aria-label={`XML of ${file.path}`} />
    </div>
  );
}

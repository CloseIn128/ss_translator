import React, { useMemo, useRef, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { parseCsvForDiff } from './diffUtils';

/**
 * Shared DiffViewer component.
 *
 * For CSV files: renders a table diff with cell-level change highlighting.
 * For JSON/text files: uses Monaco Editor's built-in diff view.
 *
 * @param {string}  original       – Original file text
 * @param {string}  translated     – Translated / modified file text
 * @param {string}  [fileType]     – 'csv' | 'json' | (anything else = text)
 * @param {boolean} [fullPage]     – If true, grows to fill available space
 * @param {string}  [height]       – CSS height for Monaco (default '360px')
 */
export default function DiffViewer({
  original = '',
  translated = '',
  fileType,
  fullPage = false,
  height = '360px',
}) {
  const isCsv = fileType === 'csv';

  if (isCsv) {
    return (
      <CsvDiffView
        original={original}
        translated={translated}
        fullPage={fullPage}
        height={height}
      />
    );
  }

  return (
    <MonacoDiffView
      original={original}
      translated={translated}
      fileType={fileType}
      fullPage={fullPage}
      height={height}
    />
  );
}

/* ── Monaco Diff View ──────────────────────────────────────────────── */

function MonacoDiffView({ original, translated, fileType, fullPage, height }) {
  const language = fileType === 'json' ? 'json' : 'plaintext';
  const editorRef = useRef(null);

  const isEmpty = !original && !translated;
  const noChanges = original === translated;

  // Auto-resize when in fullPage mode
  useEffect(() => {
    if (editorRef.current && fullPage) {
      editorRef.current.layout();
    }
  });

  if (isEmpty) {
    return <div className="diff-viewer"><div className="diff-viewer-empty">无文件内容</div></div>;
  }

  if (noChanges) {
    return <div className="diff-viewer"><div className="diff-viewer-empty">无变更内容</div></div>;
  }

  const containerStyle = fullPage
    ? { flex: 1, minHeight: 0 }
    : { height };

  return (
    <div className="diff-viewer" style={containerStyle}>
      <DiffEditor
        original={original}
        modified={translated}
        language={language}
        theme="vs-dark"
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: 'on',
          wordWrap: 'on',
          diffWordWrap: 'on',
          renderOverviewRuler: false,
          contextmenu: false,
          automaticLayout: true,
        }}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
      />
    </div>
  );
}

/* ── CSV Table Diff View ───────────────────────────────────────────── */

function CsvDiffView({ original, translated, fullPage, height }) {
  const origData = useMemo(() => parseCsvForDiff(original), [original]);
  const transData = useMemo(() => parseCsvForDiff(translated), [translated]);

  const allHeaders = useMemo(() => {
    const maxCols = Math.max(
      origData.headers.length,
      transData.headers.length,
      ...origData.rows.map(r => r.length),
      ...transData.rows.map(r => r.length),
    );
    const headers = [];
    for (let c = 0; c < maxCols; c++) {
      headers.push(origData.headers[c] || transData.headers[c] || `列${c + 1}`);
    }
    return headers;
  }, [origData, transData]);

  const maxRows = Math.max(origData.rows.length, transData.rows.length);

  const wrapperStyle = fullPage
    ? { flex: 1, minHeight: 0, overflow: 'auto' }
    : { maxHeight: height, overflow: 'auto' };

  if (maxRows === 0) {
    return <div className="diff-viewer"><div className="diff-viewer-empty">无文件内容</div></div>;
  }

  return (
    <div className="diff-viewer">
      <div style={wrapperStyle}>
        <table className="csv-diff-table">
          <thead>
            <tr>
              <th className="csv-diff-row-num">#</th>
              {allHeaders.map((h, c) => (
                <th key={c} className="csv-diff-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }, (_, rowIdx) => {
              const origRow = origData.rows[rowIdx] || [];
              const transRow = transData.rows[rowIdx] || [];
              const isNewRow = rowIdx >= origData.rows.length;
              const isRemovedRow = rowIdx >= transData.rows.length;

              return (
                <tr
                  key={rowIdx}
                  className={isNewRow ? 'csv-diff-row-added' : isRemovedRow ? 'csv-diff-row-removed' : ''}
                >
                  <td className="csv-diff-row-num">{rowIdx + 1}</td>
                  {allHeaders.map((_, colIdx) => {
                    const origVal = origRow[colIdx] ?? '';
                    const transVal = transRow[colIdx] ?? '';
                    const changed = origVal !== transVal && !isNewRow && !isRemovedRow;
                    return (
                      <td
                        key={colIdx}
                        className={`csv-diff-cell${changed ? ' csv-diff-cell-changed' : ''}`}
                      >
                        {changed ? (
                          <div className="csv-diff-cell-pair">
                            <span className="csv-diff-cell-old">{origVal}</span>
                            <span className="csv-diff-cell-new">{transVal}</span>
                          </div>
                        ) : (
                          <span>{isRemovedRow ? origVal : transVal || origVal}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

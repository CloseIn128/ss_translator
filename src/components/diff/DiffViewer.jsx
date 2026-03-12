import React, { useMemo, useState } from 'react';
import { Switch, Tooltip } from 'antd';
import { EllipsisOutlined, CodeOutlined } from '@ant-design/icons';
import {
  computeAlignedDiff,
  collapseDiffRows,
  parseCsvForDiff,
  stripJsonComments,
  tokenizeJson,
} from './diffUtils';

/**
 * Shared DiffViewer component.
 *
 * @param {string}  original       – Original file text
 * @param {string}  translated     – Translated / modified file text
 * @param {string}  [fileType]     – 'csv' | 'json' | (anything else = text)
 * @param {boolean} [fullPage]     – If true, grows to fill available space (no maxHeight)
 * @param {string}  [maxHeight]    – CSS max-height for the scroll container (default '360px')
 * @param {boolean} [collapsed]    – If true, collapses unchanged sections
 */
export default function DiffViewer({
  original = '',
  translated = '',
  fileType,
  fullPage = false,
  maxHeight = '360px',
  collapsed = true,
}) {
  const isCsv = fileType === 'csv';
  const isJson = fileType === 'json';
  const [jsonHighlight, setJsonHighlight] = useState(false);

  if (isCsv) {
    return (
      <CsvDiffView
        original={original}
        translated={translated}
        fullPage={fullPage}
        maxHeight={maxHeight}
      />
    );
  }

  return (
    <TextDiffView
      original={original}
      translated={translated}
      fullPage={fullPage}
      maxHeight={maxHeight}
      collapsed={collapsed}
      isJson={isJson}
      jsonHighlight={jsonHighlight}
      onJsonHighlightChange={setJsonHighlight}
    />
  );
}

/* ── Text Diff View ────────────────────────────────────────────────── */

function TextDiffView({
  original,
  translated,
  fullPage,
  maxHeight,
  collapsed,
  isJson,
  jsonHighlight,
  onJsonHighlightChange,
}) {
  const effectiveOriginal = useMemo(() => {
    if (isJson && jsonHighlight) return stripJsonComments(original);
    return original;
  }, [original, isJson, jsonHighlight]);

  const effectiveTranslated = useMemo(() => {
    if (isJson && jsonHighlight) return stripJsonComments(translated);
    return translated;
  }, [translated, isJson, jsonHighlight]);

  const isEmpty = !effectiveOriginal && !effectiveTranslated;

  const diffRows = useMemo(
    () => isEmpty ? [] : computeAlignedDiff(effectiveOriginal, effectiveTranslated),
    [effectiveOriginal, effectiveTranslated, isEmpty],
  );

  const changeCount = useMemo(
    () => diffRows.filter(r => r.type !== 'same').length,
    [diffRows],
  );

  const displayRows = useMemo(
    () => (collapsed ? collapseDiffRows(diffRows) : diffRows),
    [diffRows, collapsed],
  );

  const wrapperStyle = fullPage
    ? { flex: 1, minHeight: 0, overflow: 'auto' }
    : { maxHeight, overflow: 'auto' };

  return (
    <div className="diff-viewer">
      {isJson && (
        <div className="diff-viewer-toolbar">
          <Tooltip title="去除注释后高亮 JSON 语法（仅影响显示，不影响实际文件）">
            <span className="diff-viewer-toggle">
              <CodeOutlined style={{ marginRight: 4 }} />
              JSON 语法高亮
              <Switch
                size="small"
                checked={jsonHighlight}
                onChange={onJsonHighlightChange}
                style={{ marginLeft: 6 }}
              />
            </span>
          </Tooltip>
        </div>
      )}
      <div style={wrapperStyle}>
        {changeCount === 0 && diffRows.length > 0 ? (
          <div className="diff-viewer-empty">无变更内容</div>
        ) : diffRows.length === 0 ? (
          <div className="diff-viewer-empty">无文件内容</div>
        ) : (
          <table className="file-diff-table">
            <thead>
              <tr>
                <th className="diff-line-num">#</th>
                <th className="diff-side-header">原始文件</th>
                <th className="diff-line-num">#</th>
                <th className="diff-side-header">翻译后文件</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) =>
                row.type === 'collapse' ? (
                  <tr key={`c${i}`} className="diff-row diff-collapse">
                    <td colSpan={4} className="diff-collapse-cell">
                      <EllipsisOutlined /> 省略 {row.count} 行未变更内容
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className={`diff-row diff-${row.type}`}>
                    <td className="diff-line-num">{row.leftNum ?? ''}</td>
                    <td className="diff-cell diff-left">
                      {isJson && jsonHighlight
                        ? <JsonHighlightedPre text={row.left} />
                        : <pre>{row.left}</pre>}
                    </td>
                    <td className="diff-line-num">{row.rightNum ?? ''}</td>
                    <td className="diff-cell diff-right">
                      {isJson && jsonHighlight
                        ? <JsonHighlightedPre text={row.right} />
                        : <pre>{row.right}</pre>}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── JSON Syntax-Highlighted Pre ───────────────────────────────────── */

function JsonHighlightedPre({ text }) {
  if (!text) return <pre>{text}</pre>;
  const tokens = tokenizeJson(text);
  return (
    <pre style={{ margin: 0 }}>
      {tokens.map((tok, i) => (
        <span key={i} className={`json-token json-${tok.type}`}>
          {tok.value}
        </span>
      ))}
    </pre>
  );
}

/* ── CSV Table Diff View ───────────────────────────────────────────── */

function CsvDiffView({ original, translated, fullPage, maxHeight }) {
  const origData = useMemo(() => parseCsvForDiff(original), [original]);
  const transData = useMemo(() => parseCsvForDiff(translated), [translated]);

  // Determine max columns
  const allHeaders = useMemo(() => {
    const maxCols = Math.max(
      origData.headers.length,
      transData.headers.length,
      ...origData.rows.map(r => r.length),
      ...transData.rows.map(r => r.length),
    );
    // Use original headers if available, else generate A, B, C...
    const headers = [];
    for (let c = 0; c < maxCols; c++) {
      headers.push(origData.headers[c] || transData.headers[c] || `列${c + 1}`);
    }
    return headers;
  }, [origData, transData]);

  const maxRows = Math.max(origData.rows.length, transData.rows.length);

  const wrapperStyle = fullPage
    ? { flex: 1, minHeight: 0, overflow: 'auto' }
    : { maxHeight, overflow: 'auto' };

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

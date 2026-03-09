import React, { useState, useEffect, useMemo } from 'react';
import { Spin } from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';

const api = window.electronAPI;

/**
 * Compute a simple line-level diff between two texts.
 * Returns an array of { type: 'same'|'removed'|'added'|'changed', left, right, leftNum, rightNum }
 */
function computeLineDiff(originalText, translatedText) {
  const origLines = originalText.split('\n');
  const transLines = translatedText.split('\n');
  const result = [];
  const maxLen = Math.max(origLines.length, transLines.length);

  let leftNum = 1;
  let rightNum = 1;

  for (let i = 0; i < maxLen; i++) {
    const left = i < origLines.length ? origLines[i] : undefined;
    const right = i < transLines.length ? transLines[i] : undefined;

    if (left === right) {
      result.push({ type: 'same', left, right, leftNum: leftNum++, rightNum: rightNum++ });
    } else if (left !== undefined && right !== undefined) {
      result.push({ type: 'changed', left, right, leftNum: leftNum++, rightNum: rightNum++ });
    } else if (left !== undefined) {
      result.push({ type: 'removed', left, right: '', leftNum: leftNum++, rightNum: null });
    } else {
      result.push({ type: 'added', left: '', right, leftNum: null, rightNum: rightNum++ });
    }
  }

  return result;
}

export default function FileDiffView({ modPath, selectedFile, entries }) {
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [original, setOriginal] = useState('');
  const [translated, setTranslated] = useState('');
  const [error, setError] = useState('');

  // Get entries for the selected file
  const fileEntries = useMemo(() => {
    if (!selectedFile) return [];
    return entries.filter(e => e.file === selectedFile);
  }, [entries, selectedFile]);

  // Load file preview whenever selected file or entries change
  useEffect(() => {
    if (!selectedFile || !modPath) {
      setOriginal('');
      setTranslated('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    api.getFilePreview({ modPath, relFile: selectedFile, entries: fileEntries })
      .then(result => {
        if (cancelled) return;
        if (result?.success) {
          setOriginal(result.original);
          setTranslated(result.translated);
        } else {
          setError(result?.error || '加载失败');
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedFile, modPath, fileEntries]);

  // Compute diff lines
  const diffLines = useMemo(() => {
    if (!original && !translated) return [];
    return computeLineDiff(original, translated);
  }, [original, translated]);

  // Count changes
  const changeCount = useMemo(() =>
    diffLines.filter(l => l.type !== 'same').length,
    [diffLines]
  );

  if (!selectedFile) return null;

  return (
    <div className="file-diff-container">
      <div className="file-diff-header" onClick={() => setVisible(!visible)}>
        <span className="file-diff-toggle">
          {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
        </span>
        <span className="file-diff-title">文件对比预览</span>
        <span className="file-diff-filename">{selectedFile}</span>
        {changeCount > 0 && (
          <span className="file-diff-changes">{changeCount} 处变更</span>
        )}
      </div>
      {visible && (
        <div className="file-diff-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 16, color: '#ff4d4f' }}>{error}</div>
          ) : diffLines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: '#8c8c8c' }}>无文件内容</div>
          ) : (
            <div className="file-diff-table-wrapper">
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
                  {diffLines.map((line, i) => (
                    <tr key={i} className={`diff-row diff-${line.type}`}>
                      <td className="diff-line-num">{line.leftNum ?? ''}</td>
                      <td className="diff-cell diff-left">
                        <pre>{line.left}</pre>
                      </td>
                      <td className="diff-line-num">{line.rightNum ?? ''}</td>
                      <td className="diff-cell diff-right">
                        <pre>{line.right}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { Spin } from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import DiffViewer from '../../components/diff/DiffViewer';
import type { TranslationEntry } from '../../../types';

const api = window.electronAPI;

/**
 * Detect file type from relative path.
 */
function detectFileType(relFile: string | null): string {
  if (!relFile) return 'text';
  const lower = relFile.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (
    lower.endsWith('.json') ||
    lower.endsWith('.faction') ||
    lower.endsWith('.ship') ||
    lower.endsWith('.skin') ||
    lower.endsWith('.variant') ||
    lower.endsWith('.skill')
  ) return 'json';
  return 'text';
}

interface FileDiffViewProps {
  modPath: string;
  selectedFile: string | null;
  entries: TranslationEntry[];
  fullPage?: boolean;
}

export default function FileDiffView({ modPath, selectedFile, entries, fullPage = false }: FileDiffViewProps) {
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [original, setOriginal] = useState('');
  const [translated, setTranslated] = useState('');
  const [error, setError] = useState('');

  const fileType = useMemo(() => detectFileType(selectedFile), [selectedFile]);

  // Get entries for the selected file
  const fileEntries = useMemo(() => {
    if (!selectedFile) return [];
    return entries.filter((e: TranslationEntry) => e.file === selectedFile);
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
        if (result?.success && result.data) {
          setOriginal(result.data.original);
          setTranslated(result.data.translated);
        } else {
          setError(result?.error || '加载失败');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedFile, modPath, fileEntries]);

  if (!selectedFile) return null;

  // Full-page mode: no collapsible header, just the diff viewer filling the space
  if (fullPage) {
    return (
      <div className="editor-diff-mode">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 16, color: '#ff4d4f' }}>{error}</div>
        ) : (
          <DiffViewer
            original={original}
            translated={translated}
            fileType={fileType}
            fullPage
          />
        )}
      </div>
    );
  }

  return (
    <div className="file-diff-container">
      <div className="file-diff-header" onClick={() => setVisible(!visible)}>
        <span className="file-diff-toggle">
          {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
        </span>
        <span className="file-diff-title">文件对比预览</span>
        <span className="file-diff-filename">{selectedFile}</span>
      </div>
      {visible && (
        <div className="file-diff-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 16, color: '#ff4d4f' }}>{error}</div>
          ) : (
            <DiffViewer
              original={original}
              translated={translated}
              fileType={fileType}
              height="360px"
            />
          )}
        </div>
      )}
    </div>
  );
}

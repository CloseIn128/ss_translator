import React, { useMemo } from 'react';
import { Tooltip, Progress } from 'antd';
import {
  FileTextOutlined,
  DatabaseOutlined,
  GlobalOutlined,
} from '@ant-design/icons';

export default function FileSidebar({ entries, selectedFile, onSelectFile }) {
  const fileStats = useMemo(() => {
    const map = {};
    for (const entry of entries) {
      if (!map[entry.file]) map[entry.file] = { total: 0, translated: 0 };
      map[entry.file].total++;
      if (entry.status !== 'untranslated' && entry.status !== 'error') {
        map[entry.file].translated++;
      }
    }
    return Object.entries(map)
      .map(([file, stats]) => ({
        file,
        ...stats,
        percent: stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0,
      }))
      .sort((a, b) => a.file.localeCompare(b.file));
  }, [entries]);

  const totalStats = useMemo(() => {
    let total = entries.length;
    let translated = 0;
    for (const e of entries) {
      if (e.status !== 'untranslated' && e.status !== 'error') translated++;
    }
    return { total, translated };
  }, [entries]);

  const overallPercent = totalStats.total > 0
    ? Math.round((totalStats.translated / totalStats.total) * 100)
    : 0;

  return (
    <div className="editor-file-sidebar">
      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <GlobalOutlined /> 总体进度
        </div>
        <Progress percent={overallPercent} size="small" />
        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
          {totalStats.translated}/{totalStats.total} 已翻译
        </div>
      </div>
      <div className="sidebar-section" style={{ flex: 1, overflow: 'auto', borderBottom: 'none' }}>
        <div className="sidebar-section-title">
          <DatabaseOutlined /> 文件列表
        </div>
        <div
          className={`file-tree-item${selectedFile === null ? ' active' : ''}`}
          onClick={() => onSelectFile(null)}
        >
          <FileTextOutlined />
          <span>全部文件</span>
          <span className="file-tree-progress">{totalStats.total}</span>
        </div>
        {fileStats.map(({ file, total, translated, percent }) => (
          <Tooltip key={file} title={file} placement="right" mouseEnterDelay={0.5}>
            <div
              className={`file-tree-item${selectedFile === file ? ' active' : ''}`}
              onClick={() => onSelectFile(file)}
            >
              <FileTextOutlined style={{ fontSize: 12, flexShrink: 0 }} />
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {file.split('/').pop()}
              </span>
              <span className="file-tree-progress">
                {percent === 100 ? '✓' : `${translated}/${total}`}
              </span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

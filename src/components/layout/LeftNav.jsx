import React, { useMemo, useState, useRef, useCallback } from 'react';
import { Button, Progress, Tooltip } from 'antd';
import {
  PlusOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  SaveOutlined,
  ExportOutlined,
  BookOutlined,
  SettingOutlined,
  SearchOutlined,
  GlobalOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const MIN_NAV_WIDTH = 160;
const MAX_NAV_WIDTH = 420;
const DEFAULT_NAV_WIDTH = 220;

export default function LeftNav({
  project,
  activeTab,
  onTabChange,
  onNewProject,
  onLoadProject,
  onSaveProject,
  onExport,
  selectedFile,
  onSelectFile,
}) {
  const [navWidth, setNavWidth] = useState(DEFAULT_NAV_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = navWidth;
    let rafId = null;

    const handleMouseMove = (e) => {
      if (!dragging.current) return;
      if (rafId) return; // throttle via rAF
      rafId = requestAnimationFrame(() => {
        const delta = e.clientX - startX.current;
        setNavWidth(Math.max(MIN_NAV_WIDTH, Math.min(MAX_NAV_WIDTH, startWidth.current + delta)));
        rafId = null;
      });
    };

    const handleMouseUp = () => {
      dragging.current = false;
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [navWidth]);
  const navItems = [
    { key: 'info', icon: <InfoCircleOutlined />, label: '基本信息', requiresProject: true },
    { key: 'editor', icon: <FileTextOutlined />, label: '翻译编辑', requiresProject: true },
    { key: 'glossary', icon: <BookOutlined />, label: '词库管理', requiresProject: true },
    { key: 'keywords', icon: <SearchOutlined />, label: '关键词提取' },
    { key: 'settings', icon: <SettingOutlined />, label: '模型配置' },
  ];

  const fileStats = useMemo(() => {
    if (!project) return [];
    const map = {};
    for (const entry of project.entries) {
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
  }, [project]);

  const totalStats = useMemo(() => {
    if (!project) return { total: 0, translated: 0 };
    let total = project.entries.length;
    let translated = 0;
    for (const e of project.entries) {
      if (e.status !== 'untranslated' && e.status !== 'error') translated++;
    }
    return { total, translated };
  }, [project]);

  const overallPercent = totalStats.total > 0
    ? Math.round((totalStats.translated / totalStats.total) * 100)
    : 0;

  return (
    <div className="left-nav" style={{ width: navWidth }}>
      {/* Drag handle */}
      <div
        className="left-nav-resize-handle"
        onMouseDown={handleResizeStart}
        title="拖拽调整宽度"
      />
      {/* Logo */}
      <div className="left-nav-logo">
        <span className="left-nav-logo-icon">🚀</span>
        <span className="left-nav-logo-text">远行星号翻译</span>
      </div>

      {/* File actions */}
      <div className="left-nav-actions">
        <Button block size="small" icon={<PlusOutlined />} onClick={onNewProject}>
          新建项目
        </Button>
        <Button block size="small" icon={<FolderOpenOutlined />} onClick={onLoadProject}>
          打开项目
        </Button>
        {project && (
          <>
            <Button block size="small" icon={<SaveOutlined />} onClick={onSaveProject}>
              保存项目
            </Button>
            <Button block size="small" icon={<ExportOutlined />} onClick={onExport}>
              导出MOD
            </Button>
          </>
        )}
      </div>

      {/* Navigation menu */}
      <div className="left-nav-menu">
        {navItems.map(item => {
          const disabled = item.requiresProject && !project;
          return (
            <div
              key={item.key}
              className={`left-nav-item${activeTab === item.key ? ' active' : ''}${disabled ? ' disabled' : ''}`}
              onClick={() => !disabled && onTabChange(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* Project info + file tree (only in editor tab with project) */}
      {project && activeTab === 'editor' && (
        <div className="left-nav-filetree">
          {/* Overall progress */}
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <GlobalOutlined /> 总体进度
            </div>
            <Progress percent={overallPercent} size="small" />
            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
              {totalStats.translated}/{totalStats.total} 已翻译
            </div>
          </div>

          {/* File list */}
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
      )}

      {/* Project name at bottom */}
      {project && (
        <div className="left-nav-project-info">
          <span>{project.modInfo?.name || '新项目'}</span>
          {project.modInfo?.version && (
            <span style={{ color: 'var(--text-secondary)' }}>v{project.modInfo.version}</span>
          )}
        </div>
      )}
    </div>
  );
}

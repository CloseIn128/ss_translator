import React, { useMemo, useState, useRef, useCallback } from 'react';
import { Button, Progress } from 'antd';
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
  InfoCircleOutlined,
  DesktopOutlined,
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
    { key: 'appSettings', icon: <DesktopOutlined />, label: '程序设置' },
  ];

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

      {/* Overall progress (when project loaded) */}
      {project && (
        <div className="left-nav-filetree">
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <GlobalOutlined /> 总体进度
            </div>
            <Progress percent={overallPercent} size="small" />
            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
              {totalStats.translated}/{totalStats.total} 已翻译
            </div>
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

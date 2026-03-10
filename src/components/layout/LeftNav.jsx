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
  GlobalOutlined,
  InfoCircleOutlined,
  DesktopOutlined,
  HistoryOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import useProjectStore from '../../store/useProjectStore';

const MIN_NAV_WIDTH = 160;
const MAX_NAV_WIDTH = 420;
const DEFAULT_NAV_WIDTH = 220;

export default function LeftNav({
  onNewProject,
  onLoadProject,
  onSaveProject,
  onExport,
}) {
  const project = useProjectStore(s => s.project);
  const activeTab = useProjectStore(s => s.activeTab);
  const setActiveTab = useProjectStore(s => s.setActiveTab);
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
    { key: 'glossary', icon: <BookOutlined />, label: '术语管理', requiresProject: true },
    { key: 'review', icon: <AuditOutlined />, label: '审核', requiresProject: true },
    { key: 'settings', icon: <SettingOutlined />, label: '模型配置' },
    { key: 'appSettings', icon: <DesktopOutlined />, label: '程序设置' },
    { key: 'requestHistory', icon: <HistoryOutlined />, label: '请求历史' },
  ];

  // Compute detailed progress stats
  const progressStats = useMemo(() => {
    if (!project) return null;

    // Term stats (glossary + keywords)
    const glossary = project.glossary || [];
    const keywords = project.keywords || [];
    const allTerms = [...glossary, ...keywords];
    const termTotal = allTerms.length;
    const termTranslated = allTerms.filter(t => t.target && t.target.trim()).length;
    const termReviewed = allTerms.filter(t => t.confirmed).length;

    // Entry stats (exclude ignored entries)
    const entries = (project.entries || []).filter(e => !e.ignored);
    const entryTotal = entries.length;
    const entryTranslated = entries.filter(
      e => e.status !== 'untranslated' && e.status !== 'error'
    ).length;
    const entryReviewed = entries.filter(e => e.status === 'reviewed').length;

    return {
      termTotal, termTranslated, termReviewed,
      entryTotal, entryTranslated, entryReviewed,
    };
  }, [project]);

  const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0;

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
              onClick={() => !disabled && setActiveTab(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* Detailed progress (when project loaded) */}
      {project && progressStats && (
        <div className="left-nav-filetree">
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <GlobalOutlined /> 总体进度
            </div>

            {/* Term progress */}
            <div className="progress-group">
              <div className="progress-label">
                <span>术语翻译</span>
                <span className="progress-numbers">{progressStats.termTranslated}/{progressStats.termTotal}</span>
              </div>
              <Progress percent={pct(progressStats.termTranslated, progressStats.termTotal)} size="small" showInfo={false} />
            </div>
            <div className="progress-group">
              <div className="progress-label">
                <span>术语审核</span>
                <span className="progress-numbers">{progressStats.termReviewed}/{progressStats.termTotal}</span>
              </div>
              <Progress percent={pct(progressStats.termReviewed, progressStats.termTotal)} size="small" strokeColor="#faad14" showInfo={false} />
            </div>

            {/* Entry progress */}
            <div className="progress-group">
              <div className="progress-label">
                <span>条目翻译</span>
                <span className="progress-numbers">{progressStats.entryTranslated}/{progressStats.entryTotal}</span>
              </div>
              <Progress percent={pct(progressStats.entryTranslated, progressStats.entryTotal)} size="small" showInfo={false} />
            </div>
            <div className="progress-group">
              <div className="progress-label">
                <span>条目审核</span>
                <span className="progress-numbers">{progressStats.entryReviewed}/{progressStats.entryTotal}</span>
              </div>
              <Progress percent={pct(progressStats.entryReviewed, progressStats.entryTotal)} size="small" strokeColor="#faad14" showInfo={false} />
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

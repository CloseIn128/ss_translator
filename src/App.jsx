import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ConfigProvider, theme, message, Modal } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import LeftNav from './components/layout/LeftNav';
import LogPanel from './components/layout/LogPanel';
import BottomBar from './components/layout/BottomBar';
import WelcomePage from './components/pages/WelcomePage';
import ProjectInfo from './components/pages/ProjectInfo';
import TranslationEditor from './components/pages/TranslationEditor';
import GlossaryPanel from './components/pages/GlossaryPanel';
import KeywordExtractor from './components/pages/KeywordExtractor';
import SettingsPanel from './components/pages/SettingsPanel';
import AppSettingsPanel from './components/pages/AppSettingsPanel';
import RequestHistory from './components/pages/RequestHistory';
import { TaskProvider } from './components/context/TaskContext';

const api = window.electronAPI;

const DEFAULT_ZOOM_LEVEL = 100;
const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

function AppInner() {
  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState('editor');
  const [selectedFile, setSelectedFile] = useState(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [logVisible, setLogVisible] = useState(false);
  const projectRef = useRef(null);

  // Keep ref in sync with state for use in async callbacks
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Zoom level setting (persisted in localStorage)
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('ss_translator_zoom_level');
    const num = Number(saved);
    return Number.isFinite(num) && num >= 50 && num <= 200 ? num : DEFAULT_ZOOM_LEVEL;
  });

  // Apply zoom via Electron webFrame API
  useEffect(() => {
    const factor = zoomLevel / 100;
    if (window.electronAPI?.setZoomFactor) {
      window.electronAPI.setZoomFactor(factor);
    }
    localStorage.setItem('ss_translator_zoom_level', String(zoomLevel));
  }, [zoomLevel]);

  // Auto-save helper (silent, no dialogs)
  const doAutoSave = useCallback(async () => {
    const p = projectRef.current;
    if (!p) return;
    // Only auto-save when there's a known save path
    if (!p.projectFilePath && !p.modPath) return;
    try {
      const result = await api.autoSaveProject(p);
      if (result?.success && result.data?.projectFilePath) {
        setProject(prev => prev ? { ...prev, projectFilePath: result.data.projectFilePath } : prev);
      }
    } catch {
      // silent failure for auto-save
    }
  }, []);

  // Periodic auto-save timer
  useEffect(() => {
    const timer = setInterval(doAutoSave, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [doAutoSave]);

  // Confirm-before-close handler
  useEffect(() => {
    const handler = api.onBeforeClose(async () => {
      const p = projectRef.current;
      if (p && (p.projectFilePath || p.modPath)) {
        // Auto-save then close
        await doAutoSave();
        api.confirmClose();
      } else if (p) {
        // Unsaved new project with no path – ask user
        Modal.confirm({
          title: '退出确认',
          content: '当前项目尚未保存，是否直接退出？',
          okText: '退出',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: () => api.confirmClose(),
        });
      } else {
        // No project loaded, just close
        api.confirmClose();
      }
    });
    return () => api.removeBeforeCloseListener(handler);
  }, [doAutoSave]);

  const handleNewProject = useCallback(async () => {
    const result = await api.createEmptyProject();
    if (result?.success) {
      setProject(result.data);
      setSelectedFile(null);
      setActiveTab('info');
      messageApi.success('已创建新项目，请在基本信息页设置MOD文件夹路径');
    } else {
      messageApi.error(result?.error || '创建项目失败');
    }
  }, [messageApi]);

  const handleLoadProject = useCallback(async () => {
    const result = await api.loadProject();
    if (!result) return;
    if (result.success) {
      setProject(result.data);
      setSelectedFile(null);
      setActiveTab('editor');
      messageApi.success('项目加载成功');
    } else {
      messageApi.error(result.error || '加载项目失败');
    }
  }, [messageApi]);

  const handleSaveProject = useCallback(async () => {
    if (!project) return;
    const result = await api.saveProject(project);
    if (result?.success) {
      // Update projectFilePath if the backend assigned one (e.g. via save dialog)
      if (result.data?.projectFilePath) {
        setProject(prev => prev ? { ...prev, projectFilePath: result.data.projectFilePath } : prev);
      }
      messageApi.success('项目保存成功');
    } else if (result) {
      messageApi.error(result?.error || '保存失败');
    }
    // result is null when user cancels save dialog
  }, [project, messageApi]);

  const handleExport = useCallback(async () => {
    if (!project) return;
    const result = await api.exportMod({ projectData: project });
    if (result?.success) {
      messageApi.success('MOD导出成功');
    } else if (result) {
      messageApi.error(result.error || '导出失败');
    }
  }, [project, messageApi]);

  const handleUpdateEntry = useCallback((entryId, updates) => {
    setProject(prev => {
      if (!prev) return prev;
      const newEntries = prev.entries.map(e =>
        e.id === entryId ? { ...e, ...updates } : e
      );
      return { ...prev, entries: newEntries };
    });
  }, []);

  const handleBatchUpdate = useCallback((updates) => {
    setProject(prev => {
      if (!prev) return prev;
      const updateMap = new Map(updates.map(u => [u.id, u]));
      const newEntries = prev.entries.map(e => {
        const upd = updateMap.get(e.id);
        return upd ? { ...e, ...upd } : e;
      });
      return { ...prev, entries: newEntries };
    });
  }, []);

  const handleUpdateGlossary = useCallback((glossary) => {
    setProject(prev => prev ? { ...prev, glossary } : prev);
  }, []);

  const handleUpdateKeywords = useCallback((keywords) => {
    setProject(prev => prev ? { ...prev, keywords } : prev);
  }, []);

  const handleProjectFieldsChange = useCallback((fields) => {
    setProject(prev => prev ? { ...prev, ...fields } : prev);
  }, []);

  // Helper to wrap tab content with display:none for inactive tabs
  const tabStyle = (tabKey) => ({
    display: activeTab === tabKey ? 'flex' : 'none',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  });

  // For project-requiring tabs, show WelcomePage if no project
  const needsProject = (tabKey) => {
    return ['info', 'editor', 'glossary'].includes(tabKey) && !project;
  };

  return (
    <>
      {contextHolder}
      <div className="app-root">
        <div className="app-layout">
          <LeftNav
            project={project}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onNewProject={handleNewProject}
            onLoadProject={handleLoadProject}
            onSaveProject={handleSaveProject}
            onExport={handleExport}
          />
          <div className="app-content">
            {/* WelcomePage shown for project-requiring tabs when no project */}
            {needsProject(activeTab) && (
              <WelcomePage onNewProject={handleNewProject} onLoadProject={handleLoadProject} />
            )}

            {/* All tabs rendered but hidden when inactive to avoid unmount/remount */}
            {project && (
              <div style={tabStyle('info')}>
                <ProjectInfo
                  project={project}
                  onProjectFieldsChange={handleProjectFieldsChange}
                  messageApi={messageApi}
                />
              </div>
            )}
            {project && (
              <div style={tabStyle('editor')}>
                <TranslationEditor
                  project={project}
                  selectedFile={selectedFile}
                  onSelectFile={setSelectedFile}
                  onUpdateEntry={handleUpdateEntry}
                  onBatchUpdate={handleBatchUpdate}
                  messageApi={messageApi}
                />
              </div>
            )}
            {project && (
              <div style={tabStyle('glossary')}>
                <GlossaryPanel
                  project={project}
                  onUpdateGlossary={handleUpdateGlossary}
                  onUpdateKeywords={handleUpdateKeywords}
                  messageApi={messageApi}
                />
              </div>
            )}
            <div style={tabStyle('keywords')}>
              <KeywordExtractor
                project={project}
                onUpdateKeywords={handleUpdateKeywords}
                onUpdateGlossary={handleUpdateGlossary}
                messageApi={messageApi}
              />
            </div>
            <div style={tabStyle('settings')}>
              <SettingsPanel
                messageApi={messageApi}
              />
            </div>
            <div style={tabStyle('appSettings')}>
              <AppSettingsPanel
                zoomLevel={zoomLevel}
                onZoomLevelChange={setZoomLevel}
              />
            </div>
            <div style={tabStyle('requestHistory')}>
              <RequestHistory />
            </div>
          </div>
        </div>
        <LogPanel visible={logVisible} />
        <BottomBar logVisible={logVisible} onToggleLog={() => setLogVisible(v => !v)} />
      </div>
    </>
  );
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: '#1890ff' },
      }}
    >
      <TaskProvider>
        <AppInner />
      </TaskProvider>
    </ConfigProvider>
  );
}


import React, { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { ConfigProvider, theme, message, Modal, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import LeftNav from './components/layout/LeftNav';
import LogPanel from './components/layout/LogPanel';
import BottomBar from './components/layout/BottomBar';
import WelcomePage from './pages/welcome';
import { TaskProvider } from './components/context/TaskContext';
import useProjectStore from './store/useProjectStore';

// Lazy-load page components for faster initial render and tab switching
const ProjectInfo = React.lazy(() => import('./pages/project-info'));
const TranslationEditor = React.lazy(() => import('./pages/translation-editor'));
const GlossaryPanel = React.lazy(() => import('./pages/glossary'));
const SettingsPanel = React.lazy(() => import('./pages/settings'));
const AppSettingsPanel = React.lazy(() => import('./pages/app-settings'));
const ReviewPanel = React.lazy(() => import('./pages/review'));
const RequestHistory = React.lazy(() => import('./pages/request-history'));

const api = window.electronAPI;

function AppInner() {
  // ---- Read state from store ----
  const project = useProjectStore(s => s.project);
  const activeTab = useProjectStore(s => s.activeTab);
  const setActiveTab = useProjectStore(s => s.setActiveTab);
  const logVisible = useProjectStore(s => s.logVisible);
  const setLogVisible = useProjectStore(s => s.setLogVisible);
  const zoomLevel = useProjectStore(s => s.zoomLevel);

  // ---- Store actions ----
  const createProject = useProjectStore(s => s.createProject);
  const loadProject = useProjectStore(s => s.loadProject);
  const saveProject = useProjectStore(s => s.saveProject);
  const autoSave = useProjectStore(s => s.autoSave);
  const exportMod = useProjectStore(s => s.exportMod);
  const startAutoSave = useProjectStore(s => s.startAutoSave);
  const stopAutoSave = useProjectStore(s => s.stopAutoSave);

  const [messageApi, contextHolder] = message.useMessage();

  // Apply zoom on mount and when it changes
  useEffect(() => {
    if (api?.setZoomFactor) api.setZoomFactor(zoomLevel / 100);
  }, [zoomLevel]);

  // Start auto-save timer on mount, stop on unmount
  useEffect(() => {
    startAutoSave();
    return () => stopAutoSave();
  }, [startAutoSave, stopAutoSave]);

  // Confirm-before-close handler
  useEffect(() => {
    const handler = api.onBeforeClose(async () => {
      const p = useProjectStore.getState().project;
      if (p && (p.projectFilePath || p.modPath)) {
        await autoSave();
        api.confirmClose();
      } else if (p) {
        Modal.confirm({
          title: '退出确认',
          content: '当前项目尚未保存，是否直接退出？',
          okText: '退出',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: () => api.confirmClose(),
        });
      } else {
        api.confirmClose();
      }
    });
    return () => api.removeBeforeCloseListener(handler);
  }, [autoSave]);

  // ---- Project action wrappers (for message feedback) ----
  const handleNewProject = useCallback(async () => {
    const result = await createProject();
    if (result?.success) {
      messageApi.success('已创建新项目，请在基本信息页设置MOD文件夹路径');
    } else {
      messageApi.error(result?.error || '创建项目失败');
    }
  }, [messageApi, createProject]);

  const handleLoadProject = useCallback(async () => {
    const result = await loadProject();
    if (!result) return;
    if (result.success) {
      messageApi.success('项目加载成功');
    } else {
      messageApi.error(result.error || '加载项目失败');
    }
  }, [messageApi, loadProject]);

  const handleSaveProject = useCallback(async () => {
    const result = await saveProject();
    if (result?.success) {
      messageApi.success('项目保存成功');
    } else if (result) {
      messageApi.error(result?.error || '保存失败');
    }
  }, [messageApi, saveProject]);

  const handleExport = useCallback(async () => {
    const result = await exportMod();
    if (result?.success) {
      messageApi.success('MOD导出成功');
    } else if (result) {
      messageApi.error(result.error || '导出失败');
    }
  }, [messageApi, exportMod]);

  // Helper to wrap tab content with display:none for inactive tabs
  const tabStyle = (tabKey) => ({
    display: activeTab === tabKey ? 'flex' : 'none',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  });

  // CSS class for tab panels - editor gets no padding, others get padding
  const tabClass = (tabKey) => tabKey === 'editor' ? 'tab-panel-editor' : 'tab-panel';

  // For project-requiring tabs, show WelcomePage if no project
  const needsProject = (tabKey) => {
    return ['info', 'editor', 'glossary', 'review'].includes(tabKey) && !project;
  };

  // Track which tabs have been visited to lazy-mount them (render on first visit, then keep mounted)
  const [visitedTabs, setVisitedTabs] = useState(new Set([activeTab]));
  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      return new Set([...prev, activeTab]);
    });
  }, [activeTab]);

  // Reset visited tabs when project changes (clear heavy tabs)
  useEffect(() => {
    if (project) {
      setVisitedTabs(new Set([activeTab]));
    }
  }, [project?.id]);

  // Only render tab if it has been visited
  const shouldRender = (tabKey) => visitedTabs.has(tabKey);

  const lazyFallback = (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flex: 1 }}>
      <Spin size="large" tip="加载中..." />
    </div>
  );

  return (
    <>
      {contextHolder}
      <div className="app-root">
        <div className="app-layout">
          <LeftNav
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
            {/* Tabs are lazy-mounted: only rendered on first visit, then kept alive */}
            {project && shouldRender('info') && (
              <div className={tabClass('info')} style={tabStyle('info')}>
                <Suspense fallback={lazyFallback}>
                  <ProjectInfo messageApi={messageApi} />
                </Suspense>
              </div>
            )}
            {project && shouldRender('editor') && (
              <div className={tabClass('editor')} style={tabStyle('editor')}>
                <Suspense fallback={lazyFallback}>
                  <TranslationEditor messageApi={messageApi} />
                </Suspense>
              </div>
            )}
            {project && shouldRender('glossary') && (
              <div className={tabClass('glossary')} style={tabStyle('glossary')}>
                <Suspense fallback={lazyFallback}>
                  <GlossaryPanel messageApi={messageApi} />
                </Suspense>
              </div>
            )}
            {project && shouldRender('review') && (
              <div className={tabClass('review')} style={tabStyle('review')}>
                <Suspense fallback={lazyFallback}>
                  <ReviewPanel messageApi={messageApi} />
                </Suspense>
              </div>
            )}
            {shouldRender('settings') && (
              <div className={tabClass('settings')} style={tabStyle('settings')}>
                <Suspense fallback={lazyFallback}>
                  <SettingsPanel messageApi={messageApi} />
                </Suspense>
              </div>
            )}
            {shouldRender('appSettings') && (
              <div className={tabClass('appSettings')} style={tabStyle('appSettings')}>
                <Suspense fallback={lazyFallback}>
                  <AppSettingsPanel />
                </Suspense>
              </div>
            )}
            {shouldRender('requestHistory') && (
              <div className={tabClass('requestHistory')} style={tabStyle('requestHistory')}>
                <Suspense fallback={lazyFallback}>
                  <RequestHistory />
                </Suspense>
              </div>
            )}
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


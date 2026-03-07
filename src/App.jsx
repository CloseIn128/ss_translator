import React, { useState, useCallback } from 'react';
import { ConfigProvider, theme, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import LeftNav from './components/LeftNav';
import WelcomePage from './components/WelcomePage';
import TranslationEditor from './components/TranslationEditor';
import GlossaryPanel from './components/GlossaryPanel';
import KeywordExtractor from './components/KeywordExtractor';
import SettingsPanel from './components/SettingsPanel';
import LogPanel from './components/LogPanel';
import BottomBar from './components/BottomBar';
import { TaskProvider } from './components/TaskContext';

const api = window.electronAPI;

function AppInner() {
  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState('editor');
  const [selectedFile, setSelectedFile] = useState(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [logVisible, setLogVisible] = useState(false);

  const handleOpenMod = useCallback(async () => {
    const modPath = await api.selectModFolder();
    if (!modPath) return;
    messageApi.loading({ content: '正在解析MOD文件...', key: 'parse', duration: 0 });
    const result = await api.createProject(modPath);
    messageApi.destroy('parse');
    if (result?.success) {
      setProject(result.data);
      setSelectedFile(null);
      setActiveTab('editor');
      messageApi.success(`成功加载 ${result.data.entries.length} 条可翻译文本`);
    } else {
      messageApi.error(result?.error || '解析MOD失败');
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
      messageApi.success('项目保存成功');
    } else {
      messageApi.error(result?.error || '保存失败');
    }
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

  const renderContent = () => {
    switch (activeTab) {
      case 'editor':
        if (!project) {
          return <WelcomePage onOpenMod={handleOpenMod} onLoadProject={handleLoadProject} />;
        }
        return (
          <TranslationEditor
            project={project}
            selectedFile={selectedFile}
            onUpdateEntry={handleUpdateEntry}
            onBatchUpdate={handleBatchUpdate}
            messageApi={messageApi}
          />
        );
      case 'glossary':
        if (!project) {
          return <WelcomePage onOpenMod={handleOpenMod} onLoadProject={handleLoadProject} />;
        }
        return (
          <GlossaryPanel
            project={project}
            onUpdateGlossary={handleUpdateGlossary}
            messageApi={messageApi}
          />
        );
      case 'keywords':
        return (
          <KeywordExtractor
            project={project}
            onUpdateGlossary={handleUpdateGlossary}
            messageApi={messageApi}
          />
        );
      case 'settings':
        return <SettingsPanel messageApi={messageApi} />;
      default:
        return null;
    }
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
            onOpenMod={handleOpenMod}
            onLoadProject={handleLoadProject}
            onSaveProject={handleSaveProject}
            onExport={handleExport}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />
          <div className="app-content">
            {renderContent()}
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


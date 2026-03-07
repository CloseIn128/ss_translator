import React from 'react';
import { Button, Dropdown } from 'antd';
import {
  FolderOpenOutlined,
  SaveOutlined,
  ExportOutlined,
  DownOutlined,
  FileTextOutlined,
  BookOutlined,
  SettingOutlined,
} from '@ant-design/icons';

export default function Header({
  project,
  activeTab,
  onTabChange,
  onOpenMod,
  onLoadProject,
  onSaveProject,
  onExport,
}) {
  const fileMenuItems = {
    items: [
      { key: 'open', label: '打开MOD文件夹', icon: <FolderOpenOutlined />, onClick: onOpenMod },
      { key: 'load', label: '加载翻译项目', icon: <FileTextOutlined />, onClick: onLoadProject },
      { type: 'divider' },
      { key: 'save', label: '保存项目', icon: <SaveOutlined />, onClick: onSaveProject, disabled: !project },
      { key: 'export', label: '导出翻译MOD', icon: <ExportOutlined />, onClick: onExport, disabled: !project },
    ],
  };

  return (
    <div className="app-header">
      <span className="logo">🚀 远行星号 MOD 翻译工具</span>

      <Dropdown menu={fileMenuItems} trigger={['click']}>
        <Button type="text" size="small" style={{ color: '#e8e8e8' }}>
          文件 <DownOutlined />
        </Button>
      </Dropdown>

      {project && (
        <>
          <Button type="text" size="small" icon={<SaveOutlined />} onClick={onSaveProject}
            style={{ color: '#e8e8e8' }}>
            保存
          </Button>
          <Button type="text" size="small" icon={<ExportOutlined />} onClick={onExport}
            style={{ color: '#e8e8e8' }}>
            导出
          </Button>
        </>
      )}

      {project && (
        <div className="nav-tabs">
          <div
            className={`nav-tab ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => onTabChange('editor')}
          >
            <FileTextOutlined /> 翻译编辑
          </div>
          <div
            className={`nav-tab ${activeTab === 'glossary' ? 'active' : ''}`}
            onClick={() => onTabChange('glossary')}
          >
            <BookOutlined /> 名词库
          </div>
          <div
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => onTabChange('settings')}
          >
            <SettingOutlined /> 设置
          </div>
        </div>
      )}

      {project && (
        <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 'auto' }}>
          {project.modInfo.name} v{project.modInfo.version}
        </span>
      )}
    </div>
  );
}



import React from 'react';
import { Button } from 'antd';
import { FolderOpenOutlined, FileTextOutlined } from '@ant-design/icons';

export default function WelcomePage({ onOpenMod, onLoadProject }) {
  return (
    <div className="welcome-page">
      <h1>🚀 远行星号 MOD 翻译工具</h1>
      <div className="welcome-actions">
        <Button type="primary" size="large" icon={<FolderOpenOutlined />} onClick={onOpenMod}>
          打开MOD文件夹
        </Button>
        <Button size="large" icon={<FileTextOutlined />} onClick={onLoadProject}>
          加载翻译项目
        </Button>
      </div>
    </div>
  );
}


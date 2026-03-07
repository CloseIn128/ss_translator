import React from 'react';
import { Button } from 'antd';
import { FolderOpenOutlined, FileTextOutlined } from '@ant-design/icons';

export default function WelcomePage({ onOpenMod, onLoadProject }) {
  return (
    <div className="welcome-page">
      <h1>🚀 远行星号 MOD 翻译工具</h1>
      <p>
        为 Starsector（远行星号）MOD 提供智能翻译支持。
        支持 AI 辅助翻译、名词库管理、翻译润色等功能。
      </p>
      <div className="welcome-actions">
        <Button type="primary" size="large" icon={<FolderOpenOutlined />} onClick={onOpenMod}>
          打开MOD文件夹
        </Button>
        <Button size="large" icon={<FileTextOutlined />} onClick={onLoadProject}>
          加载翻译项目
        </Button>
      </div>
      <div style={{ color: '#555', fontSize: 12, marginTop: 24, maxWidth: 450 }}>
        <p>支持的文件类型：</p>
        <p style={{ marginTop: 4 }}>
          CSV（ship_data, weapon_data, hull_mods, descriptions, industries, rules 等）·
          JSON（.faction, .ship, .skin, tips.json, ship_names.json）·
          mod_info.json
        </p>
      </div>
    </div>
  );
}


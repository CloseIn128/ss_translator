import { useState, useEffect } from 'react';
import { Descriptions, Input, Button, Typography, Alert, Space, Modal } from 'antd';
import {
  FolderOpenOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { MessageInstance } from 'antd/es/message/interface';
import useProjectStore from '../../store/useProjectStore';

const api = window.electronAPI;

interface ProjectInfoProps {
  messageApi: MessageInstance;
}

export default function ProjectInfo({ messageApi }: ProjectInfoProps) {
  const project = useProjectStore(s => s.project);
  const updateProjectFields = useProjectStore(s => s.updateProjectFields);
  const [localPrompt, setLocalPrompt] = useState(project?.modPrompt || '');

  // Sync localPrompt when project.modPrompt changes externally
  useEffect(() => {
    setLocalPrompt(project?.modPrompt || '');
  }, [project?.modPrompt]);

  if (!project) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#555' }}>
          <InfoCircleOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div>请先新建或打开一个翻译项目</div>
        </div>
      </div>
    );
  }

  const parseAndUpdateModPath = async (modPath: string) => {
    messageApi.loading({ content: '正在解析MOD文件...', key: 'parse', duration: 0 });
    try {
      const result = await api.parseMod(modPath);
      messageApi.destroy('parse');
      if (result?.success) {
        const parsed = result.data;
        updateProjectFields({
          modPath: parsed.modPath,
          modInfo: parsed.modInfo,
          entries: parsed.entries,
          stats: parsed.stats,
        });
        messageApi.success(`成功解析 ${parsed.entries.length} 条可翻译文本`);
      } else {
        messageApi.error(result?.error || '解析MOD失败');
      }
    } catch (err: unknown) {
      messageApi.destroy('parse');
      messageApi.error('解析MOD出错: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleSelectModPath = async () => {
    const selectedPath = await api.selectModFolder();
    if (!selectedPath) return;

    // Warn if there are existing translated entries
    if (project.entries && project.entries.length > 0) {
      Modal.confirm({
        title: '更换MOD文件夹',
        content: '更换MOD文件夹将重新解析并替换当前的翻译条目。已有的翻译将会丢失。是否继续？',
        okText: '确认更换',
        cancelText: '取消',
        onOk() {
          ;(async () => {
            await parseAndUpdateModPath(selectedPath);
          })();
        },
      });
    } else {
      await parseAndUpdateModPath(selectedPath);
    }
  };

  const handleSelectLegacyPath = async () => {
    const selectedPath = await api.selectModFolder();
    if (selectedPath) updateProjectFields({ legacyModPath: selectedPath });
  };

  const handleSelectOutputDir = async () => {
    const selectedPath = await api.selectModFolder();
    if (selectedPath) updateProjectFields({ outputDir: selectedPath });
  };

  const formatDate = (ts: number) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('zh-CN');
  };

  const hasModInfo = project.modInfo && Object.keys(project.modInfo).length > 0;

  return (
    <div className="centered-page-container">
      <div>
        {/* Project info */}
        <Typography.Title level={5} style={{ marginTop: 0 }}>📋 项目信息</Typography.Title>
        <Descriptions bordered column={2} size="small" style={{ marginBottom: 24 }}>
          <Descriptions.Item label="项目ID">
            <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{project.id}</span>
          </Descriptions.Item>
          <Descriptions.Item label="项目版本">{project.version || '1.0'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(project.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatDate(project.updatedAt)}</Descriptions.Item>
          <Descriptions.Item label="翻译条目">
            {project.entries?.length || 0} 条
            {project.stats?.translated ? ` (已翻译 ${project.stats.translated})` : ''}
          </Descriptions.Item>
          <Descriptions.Item label="词库条目">{project.glossary?.length || 0} 条</Descriptions.Item>
        </Descriptions>

        {/* MOD info */}
        {hasModInfo && (
          <>
            <Typography.Title level={5}>🎮 MOD信息</Typography.Title>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 24 }}>
              <Descriptions.Item label="MOD名称">{project.modInfo.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="MOD ID">{project.modInfo.id || '—'}</Descriptions.Item>
              <Descriptions.Item label="版本">{project.modInfo.version || '—'}</Descriptions.Item>
              <Descriptions.Item label="作者">{project.modInfo.author || '—'}</Descriptions.Item>
              {project.modInfo.description && (
                <Descriptions.Item label="描述" span={2}>{project.modInfo.description}</Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}

        {/* Path configuration */}
        <Typography.Title level={5}>📁 路径配置</Typography.Title>
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>MOD文件夹路径</div>
            <Space.Compact style={{ width: '100%' }}>
              <Input value={project.modPath || ''} readOnly placeholder="未设置 — 点击浏览选择MOD文件夹" />
              <Button icon={<FolderOpenOutlined />} onClick={handleSelectModPath}>浏览</Button>
            </Space.Compact>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>老版本MOD路径</div>
            <Space.Compact style={{ width: '100%' }}>
              <Input value={project.legacyModPath || ''} readOnly placeholder="未设置（可选）" />
              <Button icon={<FolderOpenOutlined />} onClick={handleSelectLegacyPath}>浏览</Button>
            </Space.Compact>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>输出文件夹</div>
            <Space.Compact style={{ width: '100%' }}>
              <Input value={project.outputDir || ''} readOnly placeholder="未设置（导出时选择）" />
              <Button icon={<FolderOpenOutlined />} onClick={handleSelectOutputDir}>浏览</Button>
            </Space.Compact>
          </div>
        </div>

        {/* MOD prompt */}
        <Typography.Title level={5}>💡 MOD专属提示词</Typography.Title>
        <Alert
          type="info"
          showIcon
          message="这些内容会在AI翻译时自动注入到上下文中，帮助AI更好地理解并翻译MOD内容。"
          style={{ marginBottom: 12, fontSize: 12 }}
        />
        <Input.TextArea
          value={localPrompt}
          onChange={e => {
            setLocalPrompt(e.target.value);
            updateProjectFields({ modPrompt: e.target.value });
          }}
          placeholder={`示例：\n这是一个以银河战争为背景的MOD，主要讲述"星际联盟"与"暗影帝国"之间的对抗。\n翻译风格偏硬科幻军事风格，使用正式、简洁的军事用语。`}
          rows={6}
          style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }}
        />
        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
          提示词修改后自动保存到项目中，所有AI翻译和润色操作都会自动包含这些信息。
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { Modal, Spin, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  FileTextOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import DiffViewer from './diff/DiffViewer';
import type { Project } from '../../types/project';
import type { ExportPreviewFile } from '../../types/api';

const api = window.electronAPI;

interface ExportPreviewModalProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ExportPreviewModal({ open, project, onClose, onConfirm }: ExportPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<ExportPreviewFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Load preview data when modal opens
  useEffect(() => {
    if (!open || !project?.modPath) return;

    setLoading(true);
    setError('');
    setFiles([]);
    setSelectedFile(null);

    api.getExportPreview({ modPath: project.modPath, entries: project.entries || [] })
      .then(result => {
        if (result?.success && result.data) {
          setFiles(result.data.files || []);
          if (result.data.files?.length > 0) {
            setSelectedFile(result.data.files[0].relFile);
          }
        } else {
          setError(result?.error || '预览加载失败');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, project]);

  // Build tree data from file list
  const treeData = useMemo(() => {
    return buildFileTree(files.map(f => f.relFile));
  }, [files]);

  // Current file for diff viewing
  const currentFile = useMemo(() => {
    return files.find(f => f.relFile === selectedFile) || null;
  }, [files, selectedFile]);

  return (
    <Modal
      title={`导出预览 — 共 ${files.length} 个文件有变更`}
      open={open}
      onCancel={onClose}
      onOk={onConfirm}
      okText="确认导出"
      cancelText="取消"
      width="90vw"
      style={{ top: 24 }}
      styles={{ body: { height: 'calc(80vh - 110px)', padding: 0, overflow: 'hidden' } }}
      destroyOnClose
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Spin size="large" tip="正在生成预览..." />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#ff4d4f' }}>{error}</div>
      ) : files.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#8c8c8c' }}>
          没有需要导出的变更
        </div>
      ) : (
        <div className="export-preview-layout">
          <div className="export-preview-sidebar">
            <div className="export-preview-sidebar-title">变更文件列表</div>
            <Tree
              treeData={treeData}
              selectedKeys={selectedFile ? [selectedFile] : []}
              onSelect={(keys) => {
                if (keys.length > 0 && files.some(f => f.relFile === keys[0])) {
                  setSelectedFile(keys[0] as string);
                }
              }}
              defaultExpandAll
              blockNode
              showIcon
            />
          </div>
          <div className="export-preview-diff">
            {currentFile ? (
              <DiffViewer
                original={currentFile.original}
                translated={currentFile.translated}
                fileType={currentFile.fileType}
                fullPage
              />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#8c8c8c' }}>
                请选择一个文件查看变更
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Build a tree structure from flat file paths for Ant Design Tree.
 */
interface FileTreeNode {
  [key: string]: FileTreeNode;
}

function buildFileTree(filePaths: string[]): DataNode[] {
  const root: FileTreeNode = {};

  for (const filePath of filePaths) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    let node: FileTreeNode = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node[part]) node[part] = {};
      node = node[part];
    }
  }

  function toTreeData(node: FileTreeNode, prefix = ''): DataNode[] {
    const entries = Object.entries(node);
    return entries.map(([name, children]) => {
      const key = prefix ? `${prefix}/${name}` : name;
      const childKeys = Object.keys(children);
      if (childKeys.length === 0) {
        // Leaf (file)
        return {
          key,
          title: name,
          icon: <FileTextOutlined />,
          isLeaf: true,
        };
      }
      // Folder
      return {
        key: `folder:${key}`,
        title: name,
        icon: <FolderOutlined />,
        selectable: false,
        children: toTreeData(children as FileTreeNode, key),
      };
    });
  }

  return toTreeData(root);
}

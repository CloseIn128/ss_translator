import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Tooltip } from 'antd';
import {
  FileTextOutlined,
  DatabaseOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  RightOutlined,
  DownOutlined,
} from '@ant-design/icons';

const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 220;

/**
 * Build a tree structure from flat file paths.
 * Each node: { name, path, children[], files[], total, translated }
 */
function buildFileTree(fileStats) {
  const root = { name: '', path: '', children: [], files: [], total: 0, translated: 0 };

  for (const fs of fileStats) {
    const parts = fs.file.split('/');
    let node = root;
    // Navigate/create folder nodes
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      let child = node.children.find(c => c.name === folderName);
      if (!child) {
        child = {
          name: folderName,
          path: parts.slice(0, i + 1).join('/'),
          children: [],
          files: [],
          total: 0,
          translated: 0,
        };
        node.children.push(child);
      }
      child.total += fs.total;
      child.translated += fs.translated;
      node = child;
    }
    // Add file to leaf folder
    node.files.push(fs);
  }

  // Sort children and files alphabetically
  function sortNode(node) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.files.sort((a, b) => a.file.localeCompare(b.file));
    for (const child of node.children) sortNode(child);
  }
  sortNode(root);

  return root;
}

function FolderNode({ node, depth, selectedFile, onSelectFile, expandedFolders, toggleFolder }) {
  const isExpanded = expandedFolders.has(node.path);
  const percent = node.total > 0 ? Math.round((node.translated / node.total) * 100) : 0;

  return (
    <>
      <div
        className="file-tree-item file-tree-folder"
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => toggleFolder(node.path)}
      >
        <span className="file-tree-expand-icon">
          {isExpanded ? <DownOutlined /> : <RightOutlined />}
        </span>
        {isExpanded ? <FolderOpenOutlined style={{ fontSize: 12 }} /> : <FolderOutlined style={{ fontSize: 12 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {node.name}
        </span>
        <span className="file-tree-progress">
          {percent === 100 ? '✓' : `${percent}%`}
        </span>
      </div>
      {isExpanded && (
        <>
          {node.children.map(child => (
            <FolderNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          ))}
          {node.files.map(({ file, total, translated, percent: filePct }) => (
            <Tooltip key={file} title={file} placement="right" mouseEnterDelay={0.5}>
              <div
                className={`file-tree-item${selectedFile === file ? ' active' : ''}`}
                style={{ paddingLeft: 8 + (depth + 1) * 16 }}
                onClick={() => onSelectFile(file)}
              >
                <FileTextOutlined style={{ fontSize: 12, flexShrink: 0 }} />
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {file.split('/').pop()}
                </span>
                <span className="file-tree-progress">
                  {filePct === 100 ? '✓' : `${translated}/${total}`}
                </span>
              </div>
            </Tooltip>
          ))}
        </>
      )}
    </>
  );
}

export default function FileSidebar({ entries, selectedFile, onSelectFile }) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    let rafId = null;

    const handleMouseMove = (e) => {
      if (!dragging.current) return;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        const delta = e.clientX - startX.current;
        setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startWidth.current + delta)));
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
  }, [sidebarWidth]);

  const fileStats = useMemo(() => {
    const map = {};
    for (const entry of entries) {
      if (!map[entry.file]) map[entry.file] = { total: 0, translated: 0 };
      map[entry.file].total++;
      if (entry.status !== 'untranslated' && entry.status !== 'error') {
        map[entry.file].translated++;
      }
    }
    return Object.entries(map)
      .map(([file, stats]) => ({
        file,
        ...stats,
        percent: stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0,
      }))
      .sort((a, b) => a.file.localeCompare(b.file));
  }, [entries]);

  const totalStats = useMemo(() => {
    let total = entries.length;
    let translated = 0;
    for (const e of entries) {
      if (e.status !== 'untranslated' && e.status !== 'error') translated++;
    }
    return { total, translated };
  }, [entries]);

  const tree = useMemo(() => buildFileTree(fileStats), [fileStats]);

  // Expand all folders by default; re-initialize when tree changes
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  useEffect(() => {
    const allPaths = new Set();
    function collectPaths(node) {
      if (node.path) allPaths.add(node.path);
      for (const child of node.children) collectPaths(child);
    }
    collectPaths(tree);
    setExpandedFolders(allPaths);
  }, [tree]);

  const toggleFolder = useCallback((path) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="editor-file-sidebar" style={{ width: sidebarWidth }}>
      {/* Drag resize handle */}
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeStart}
        title="拖拽调整宽度"
      />

      <div className="sidebar-section" style={{ flex: 1, overflow: 'auto', borderBottom: 'none' }}>
        <div className="sidebar-section-title">
          <DatabaseOutlined /> 文件列表
        </div>
        <div
          className={`file-tree-item${selectedFile === null ? ' active' : ''}`}
          onClick={() => onSelectFile(null)}
        >
          <FileTextOutlined />
          <span>全部文件</span>
          <span className="file-tree-progress">{totalStats.total}</span>
        </div>
        {/* Render tree: if tree has only one root child, collapse it */}
        {tree.children.length === 1 && tree.files.length === 0 ? (
          // Skip single root folder — render its contents directly
          <>
            {tree.children[0].children.map(child => (
              <FolderNode
                key={child.path}
                node={child}
                depth={0}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            ))}
            {tree.children[0].files.map(({ file, total, translated, percent }) => (
              <Tooltip key={file} title={file} placement="right" mouseEnterDelay={0.5}>
                <div
                  className={`file-tree-item${selectedFile === file ? ' active' : ''}`}
                  onClick={() => onSelectFile(file)}
                >
                  <FileTextOutlined style={{ fontSize: 12, flexShrink: 0 }} />
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {file.split('/').pop()}
                  </span>
                  <span className="file-tree-progress">
                    {percent === 100 ? '✓' : `${translated}/${total}`}
                  </span>
                </div>
              </Tooltip>
            ))}
          </>
        ) : (
          <>
            {tree.children.map(child => (
              <FolderNode
                key={child.path}
                node={child}
                depth={0}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            ))}
            {tree.files.map(({ file, total, translated, percent }) => (
              <Tooltip key={file} title={file} placement="right" mouseEnterDelay={0.5}>
                <div
                  className={`file-tree-item${selectedFile === file ? ' active' : ''}`}
                  onClick={() => onSelectFile(file)}
                >
                  <FileTextOutlined style={{ fontSize: 12, flexShrink: 0 }} />
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {file.split('/').pop()}
                  </span>
                  <span className="file-tree-progress">
                    {percent === 100 ? '✓' : `${translated}/${total}`}
                  </span>
                </div>
              </Tooltip>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

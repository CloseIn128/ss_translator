import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { Button, Switch, Tag, Tooltip } from 'antd';
import { ClearOutlined, BugOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
import { useTask } from './TaskContext';

const LEVEL_COLORS = {
  debug: '#555',
  info: '#1890ff',
  success: '#52c41a',
  warning: '#faad14',
  error: '#ff4d4f',
};

const LEVEL_LABELS = {
  debug: 'DBG',
  info: 'INF',
  success: 'OK',
  warning: 'WRN',
  error: 'ERR',
};

const DEFAULT_LOG_HEIGHT = 260;
const MIN_LOG_HEIGHT = 80;

function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function LogPanel({ visible }) {
  const { logs, debugMode, setDebugMode, clearLogs } = useTask();
  const listRef = useRef(null);
  const autoScrollRef = useRef(true);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_LOG_HEIGHT);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const displayLogs = useMemo(() => {
    if (debugMode) return logs;
    return logs.filter(l => l.level !== 'debug');
  }, [logs, debugMode]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [displayLogs]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const el = listRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    autoScrollRef.current = atBottom;
  };

  // Drag-to-resize logic
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = panelHeight;
    const maxH = window.innerHeight * 0.5;

    const handleMouseMove = (e) => {
      if (!dragging.current) return;
      // Dragging up = increase height, dragging down = decrease
      const delta = startY.current - e.clientY;
      const newHeight = Math.max(MIN_LOG_HEIGHT, Math.min(maxH, startHeight.current + delta));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [panelHeight]);

  if (!visible) return null;

  return (
    <div className="log-panel" style={{ height: panelHeight }}>
      <div
        className="log-panel-drag-handle"
        onMouseDown={handleDragStart}
        title="拖拽调整高度"
      />
      <div className="log-panel-header">
        <span className="log-panel-title">日志输出</span>
        <div className="log-panel-controls">
          <Tooltip title="调试日志">
            <span className="log-panel-debug-toggle">
              <BugOutlined style={{ marginRight: 4, fontSize: 12 }} />
              <Switch
                size="small"
                checked={debugMode}
                onChange={setDebugMode}
              />
            </span>
          </Tooltip>
          <Tooltip title="滚动到底部">
            <Button
              type="text"
              size="small"
              icon={<VerticalAlignBottomOutlined />}
              onClick={() => {
                if (listRef.current) {
                  listRef.current.scrollTop = listRef.current.scrollHeight;
                  autoScrollRef.current = true;
                }
              }}
            />
          </Tooltip>
          <Tooltip title="清空日志">
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={clearLogs} />
          </Tooltip>
        </div>
      </div>
      <div className="log-panel-content" ref={listRef} onScroll={handleScroll}>
        {displayLogs.length === 0 && (
          <div className="log-panel-empty">暂无日志</div>
        )}
        {displayLogs.map(entry => (
          <div key={entry.id} className="log-entry">
            <span className="log-time">{formatTime(entry.timestamp)}</span>
            <span className="log-level-tag">
              <Tag
                color={LEVEL_COLORS[entry.level]}
                style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
              >
                {LEVEL_LABELS[entry.level] || entry.level}
              </Tag>
            </span>
            <span className="log-source">
              {entry.source ? `[${entry.source}]` : ''}
            </span>
            <span className="log-message">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

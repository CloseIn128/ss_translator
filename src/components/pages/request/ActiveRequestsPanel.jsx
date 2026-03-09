import React from 'react';
import { Tag, Button } from 'antd';
import {
  EyeOutlined,
  SyncOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';

const TYPE_LABELS = {
  'batch-translate': '批量翻译',
  'entry-polish': '条目润色',
  'keyword-extract': '关键词提取',
  'keyword-translate': '关键词翻译',
  'keyword-polish': '关键词润色',
  'unknown': '未知',
};

function formatTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

export default function ActiveRequestsPanel({ activeRequests, onViewDetail }) {
  if (activeRequests.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#555' }}>
        <ClockCircleOutlined style={{ fontSize: 24, marginBottom: 8 }} />
        <div>当前没有正在进行的请求</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {activeRequests.map(req => (
        <div key={req.id} style={{
          padding: '8px 12px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
        }}
          onClick={() => onViewDetail(req.id)}
        >
          <SyncOutlined spin style={{ color: '#1890ff' }} />
          <Tag color="processing" style={{ fontSize: 11 }}>#{req.id}</Tag>
          <Tag style={{ fontSize: 11 }}>{TYPE_LABELS[req.type] || req.type}</Tag>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{req.model}</span>
          <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 'auto' }}>
            {formatTime(req.startTime)}
          </span>
          <Button size="small" type="text" icon={<EyeOutlined />}
            onClick={(e) => { e.stopPropagation(); onViewDetail(req.id); }} />
        </div>
      ))}
    </div>
  );
}

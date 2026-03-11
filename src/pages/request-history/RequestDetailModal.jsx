import React, { useState, useEffect, useRef } from 'react';
import { Modal, Tag, Descriptions, Tabs, Empty } from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';

const api = window.electronAPI;

const TYPE_LABELS = {
  'batch-translate': '批量翻译',
  'entry-polish': '条目润色',
  'keyword-extract': '关键词提取',
  'keyword-translate': '关键词翻译',
  'keyword-polish': '关键词润色',
  'unknown': '未知',
};

const STATUS_MAP = {
  pending: { color: 'processing', icon: <SyncOutlined spin />, text: '进行中' },
  success: { color: 'success', icon: <CheckCircleOutlined />, text: '成功' },
  error: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
};

function formatTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

function formatDuration(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatResponseRaw(raw) {
  if (!raw) return '(空)';
  try { return JSON.stringify(JSON.parse(raw), null, 2); }
  catch { return raw; }
}

const preStyle = {
  background: '#111', padding: 12, borderRadius: 6,
  fontSize: 12, maxHeight: 300, overflow: 'auto',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};

export default function RequestDetailModal({ requestId, open, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef(null);

  useEffect(() => {
    if (open && requestId != null) {
      setLoading(true);
      api.getRequestDetail(requestId).then(data => {
        setDetail(data);
        setLoading(false);
        if (data && data.status === 'pending') {
          refreshRef.current = setInterval(async () => {
            const refreshed = await api.getRequestDetail(requestId);
            if (refreshed) {
              setDetail(refreshed);
              if (refreshed.status !== 'pending' && refreshRef.current) {
                clearInterval(refreshRef.current);
                refreshRef.current = null;
              }
            }
          }, 2000);
        }
      });
    } else {
      setDetail(null);
    }
    return () => {
      if (refreshRef.current) {
        clearInterval(refreshRef.current);
        refreshRef.current = null;
      }
    };
  }, [open, requestId]);

  const statusInfo = detail ? (STATUS_MAP[detail.status] || STATUS_MAP.pending) : null;

  return (
    <Modal
      title={`请求详情 #${requestId || ''}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8c8c8c' }}>加载中...</div>}
      {!loading && !detail && <Empty description="请求记录未找到" />}
      {!loading && detail && (
        <div style={{ maxHeight: '65vh', overflow: 'auto' }}>
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="请求ID">#{detail.id}</Descriptions.Item>
            <Descriptions.Item label="类型">
              <Tag>{TYPE_LABELS[detail.type] || detail.type}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusInfo.color} icon={statusInfo.icon}>{statusInfo.text}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="模型">{detail.model}</Descriptions.Item>
            <Descriptions.Item label="开始时间">{formatTime(detail.startTime)}</Descriptions.Item>
            <Descriptions.Item label="结束时间">{formatTime(detail.endTime)}</Descriptions.Item>
            <Descriptions.Item label="耗时">{formatDuration(detail.durationMs)}</Descriptions.Item>
            <Descriptions.Item label="API地址">{detail.apiUrl}</Descriptions.Item>
            {detail.tokenUsage && (
              <>
                <Descriptions.Item label="输入Token">{detail.tokenUsage.prompt_tokens ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="输出Token">{detail.tokenUsage.completion_tokens ?? '-'}</Descriptions.Item>
              </>
            )}
            {detail.error && (
              <Descriptions.Item label="错误信息" span={2}>
                <span style={{ color: '#ff4d4f' }}>{detail.error}</span>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Tabs
            size="small"
            items={[
              {
                key: 'system',
                label: 'System Prompt',
                children: (
                  <pre style={{ ...preStyle, maxHeight: 200 }}>
                    {detail.systemPrompt || '(空)'}
                  </pre>
                ),
              },
              {
                key: 'user',
                label: 'User Message',
                children: <pre style={preStyle}>{detail.userMessage || '(空)'}</pre>,
              },
              {
                key: 'response',
                label: 'Response',
                children: <pre style={preStyle}>{detail.responseContent || detail.error || '(空)'}</pre>,
              },
              {
                key: 'raw',
                label: 'Raw Response',
                children: <pre style={preStyle}>{formatResponseRaw(detail.responseRaw)}</pre>,
              },
            ]}
          />
        </div>
      )}
    </Modal>
  );
}

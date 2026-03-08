import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Tag, Modal, Pagination, Descriptions, Tabs, Space, Empty } from 'antd';
import {
  ReloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
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

// ─── Active Requests Panel ──────────────────────────────────────────

function ActiveRequestsPanel({ activeRequests, onViewDetail }) {
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

// ─── Request Detail Modal ──────────────────────────────────────────

function RequestDetailModal({ requestId, open, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef(null);

  useEffect(() => {
    if (open && requestId != null) {
      setLoading(true);
      api.getRequestDetail(requestId).then(data => {
        setDetail(data);
        setLoading(false);
      });
      // Auto-refresh for pending requests
      refreshRef.current = setInterval(async () => {
        const data = await api.getRequestDetail(requestId);
        if (data) {
          setDetail(data);
          // Stop refreshing once completed
          if (data.status !== 'pending' && refreshRef.current) {
            clearInterval(refreshRef.current);
            refreshRef.current = null;
          }
        }
      }, 2000);
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
                  <pre style={{
                    background: '#111', padding: 12, borderRadius: 6,
                    fontSize: 12, maxHeight: 200, overflow: 'auto',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {detail.systemPrompt || '(空)'}
                  </pre>
                ),
              },
              {
                key: 'user',
                label: 'User Message',
                children: (
                  <pre style={{
                    background: '#111', padding: 12, borderRadius: 6,
                    fontSize: 12, maxHeight: 300, overflow: 'auto',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {detail.userMessage || '(空)'}
                  </pre>
                ),
              },
              {
                key: 'response',
                label: 'Response',
                children: (
                  <pre style={{
                    background: '#111', padding: 12, borderRadius: 6,
                    fontSize: 12, maxHeight: 300, overflow: 'auto',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {detail.responseContent || detail.error || '(空)'}
                  </pre>
                ),
              },
              {
                key: 'raw',
                label: 'Raw Response',
                children: (
                  <pre style={{
                    background: '#111', padding: 12, borderRadius: 6,
                    fontSize: 12, maxHeight: 300, overflow: 'auto',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {formatResponseRaw(detail.responseRaw)}
                  </pre>
                ),
              },
            ]}
          />
        </div>
      )}
    </Modal>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function RequestHistory() {
  const [history, setHistory] = useState([]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const refreshTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchData = async () => {
    setLoading(true);
    const [historyData, activeData] = await Promise.all([
      api.getRequestHistory(),
      api.getActiveRequests(),
    ]);
    if (!mountedRef.current) return;
    setHistory((historyData || []).reverse()); // newest first
    setActiveRequests(activeData || []);
    setLoading(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    // Auto-refresh every 2s for active requests
    refreshTimerRef.current = setInterval(async () => {
      const activeData = await api.getActiveRequests();
      if (!mountedRef.current) return;
      setActiveRequests(activeData || []);
      // Also refresh history if there were active requests
      if (activeData && activeData.length > 0) {
        const historyData = await api.getRequestHistory();
        if (!mountedRef.current) return;
        setHistory((historyData || []).reverse());
      }
    }, 2000);
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  const handleClear = async () => {
    await api.clearRequestHistory();
    setHistory([]);
  };

  const handleViewDetail = (id) => {
    setDetailId(id);
    setDetailOpen(true);
  };

  const columns = [
    {
      title: '#',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      render: (id) => <span style={{ fontSize: 11, color: '#8c8c8c' }}>#{id}</span>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      filters: Object.entries(TYPE_LABELS).map(([k, v]) => ({ text: v, value: k })),
      onFilter: (value, record) => record.type === value,
      render: (type) => <Tag style={{ fontSize: 11 }}>{TYPE_LABELS[type] || type}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      filters: [
        { text: '成功', value: 'success' },
        { text: '失败', value: 'error' },
        { text: '进行中', value: 'pending' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => {
        const info = STATUS_MAP[status] || STATUS_MAP.pending;
        return <Tag color={info.color} icon={info.icon} style={{ fontSize: 11 }}>{info.text}</Tag>;
      },
    },
    {
      title: '模型',
      dataIndex: 'model',
      key: 'model',
      width: 120,
      render: (model) => <span style={{ fontSize: 12 }}>{model}</span>,
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      key: 'duration',
      width: 80,
      sorter: (a, b) => (a.durationMs || 0) - (b.durationMs || 0),
      render: (ms) => <span style={{ fontSize: 12 }}>{formatDuration(ms)}</span>,
    },
    {
      title: 'Token',
      dataIndex: 'tokenUsage',
      key: 'tokens',
      width: 100,
      render: (usage) => {
        if (!usage) return <span style={{ fontSize: 12, color: '#555' }}>-</span>;
        const total = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
        return <span style={{ fontSize: 12 }}>{total}</span>;
      },
    },
    {
      title: '时间',
      dataIndex: 'startTime',
      key: 'time',
      width: 80,
      render: (t) => <span style={{ fontSize: 12, color: '#8c8c8c' }}>{formatTime(t)}</span>,
    },
    {
      title: '预览',
      dataIndex: 'responsePreview',
      key: 'preview',
      ellipsis: true,
      render: (text) => <span style={{ fontSize: 12, color: '#8c8c8c' }}>{text || '-'}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 60,
      render: (_, record) => (
        <Button size="small" type="text" icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record.id)} />
      ),
    },
  ];

  // Paginate data manually
  const paginatedHistory = history.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>AI 请求历史</span>
        <Button size="small" icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          刷新
        </Button>
        <Button size="small" danger icon={<DeleteOutlined />} onClick={handleClear}
          disabled={history.length === 0}>
          清空历史
        </Button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>
          共 {history.length} 条记录 | 活跃请求: {activeRequests.length}
        </span>
      </div>

      {/* Active requests */}
      {activeRequests.length > 0 && (
        <div style={{ marginBottom: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8c8c8c', marginBottom: 6 }}>
            <SyncOutlined spin style={{ marginRight: 4 }} />
            活跃请求 ({activeRequests.length})
          </div>
          <ActiveRequestsPanel activeRequests={activeRequests} onViewDetail={handleViewDetail} />
        </div>
      )}

      {/* History table with independent pagination */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table
            dataSource={paginatedHistory}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={false}
            loading={loading}
          />
        </div>
        {history.length > 0 && (
          <div style={{ flexShrink: 0, padding: '8px 0', display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={history.length}
              onChange={(page, size) => { setCurrentPage(page); setPageSize(size); }}
              onShowSizeChange={(_, size) => { setPageSize(size); setCurrentPage(1); }}
              showSizeChanger
              pageSizeOptions={['10', '20', '50', '100']}
              showTotal={t => `共 ${t} 条`}
              size="small"
            />
          </div>
        )}
      </div>

      {/* Detail modal */}
      <RequestDetailModal
        requestId={detailId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}

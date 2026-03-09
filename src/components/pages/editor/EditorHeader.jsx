import React from 'react';
import { Input, Select, Button } from 'antd';
import {
  HighlightOutlined,
  SearchOutlined,
  RobotOutlined,
  DeleteOutlined,
} from '@ant-design/icons';

export default function EditorHeader({
  stats,
  unreviewedTermCount,
  filteredCount,
  searchText,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  categories,
  statusFilter,
  onStatusChange,
  batchTranslating,
  isTaskRunning,
  onBatchTranslate,
  onBatchPolish,
  onClearTranslations,
}) {
  return (
    <div className="editor-header">
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">当前条目数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.translated}</div>
          <div className="stat-label">已翻译</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0}%
          </div>
          <div className="stat-label">翻译进度</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={unreviewedTermCount > 0 ? { color: '#faad14' } : {}}>
            {unreviewedTermCount}
          </div>
          <div className="stat-label">术语待审核</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索原文、译文、上下文..."
          value={searchText}
          onChange={e => onSearchChange(e.target.value)}
          allowClear
          style={{ width: 280 }}
          size="small"
        />
        <Select
          value={categoryFilter}
          onChange={onCategoryChange}
          style={{ width: 140 }}
          size="small"
          options={categories.map(c => ({
            value: c,
            label: c === 'all' ? '全部分类' : c,
          }))}
        />
        <Select
          value={statusFilter}
          onChange={onStatusChange}
          style={{ width: 120 }}
          size="small"
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'untranslated', label: '未翻译' },
            { value: 'translated', label: '已翻译' },
            { value: 'polished', label: '已润色' },
            { value: 'reviewed', label: '已审核' },
            { value: 'error', label: '错误' },
          ]}
        />
        <Button
          type="primary"
          size="small"
          icon={<RobotOutlined />}
          onClick={onBatchTranslate}
          loading={batchTranslating}
          disabled={isTaskRunning && !batchTranslating}
        >
          批量翻译
        </Button>
        <Button
          size="small"
          icon={<HighlightOutlined />}
          onClick={onBatchPolish}
          loading={batchTranslating}
          disabled={isTaskRunning && !batchTranslating}
        >
          批量润色
        </Button>
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={onClearTranslations}
          disabled={isTaskRunning}
        >
          清空翻译
        </Button>
        <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 'auto' }}>
          共 {filteredCount} 条
        </span>
      </div>
    </div>
  );
}

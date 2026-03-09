import React, { useState } from 'react';
import { Tag, Button, Tooltip, Space, Spin } from 'antd';
import {
  TranslationOutlined,
  HighlightOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

const STATUS_MAP = {
  untranslated: { label: '未翻译', color: 'default' },
  translated: { label: '已翻译', color: 'success' },
  polished: { label: '已润色', color: 'processing' },
  reviewed: { label: '已审核', color: 'warning' },
  error: { label: '错误', color: 'error' },
};

export default function EntryRow({ entry, isTranslating, onUpdateEntry, onTranslate, onPolish }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(entry.translated || '');

  const handleSave = () => {
    onUpdateEntry(entry.id, {
      translated: editText,
      status: editText.trim() ? 'translated' : 'untranslated',
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditText(entry.translated || '');
    setEditing(false);
  };

  const statusInfo = STATUS_MAP[entry.status] || STATUS_MAP.untranslated;

  return (
    <div className="entry-row">
      {/* Original text */}
      <div className="entry-original">
        <div className="entry-meta">
          <Tag color={statusInfo.color} style={{ fontSize: 10 }}>{statusInfo.label}</Tag>
          <span>{entry.context}</span>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{entry.original}</div>
      </div>

      {/* Translated text */}
      <div className="entry-translated">
        {editing ? (
          <div>
            <textarea
              className="translation-textarea"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={3}
              autoFocus
            />
            <Space size={4} style={{ marginTop: 4 }}>
              <Button size="small" type="primary" onClick={handleSave}>保存</Button>
              <Button size="small" onClick={handleCancel}>取消</Button>
            </Space>
          </div>
        ) : (
          <div
            onClick={() => { setEditText(entry.translated || ''); setEditing(true); }}
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              cursor: 'pointer',
              minHeight: 40,
              padding: 4,
              borderRadius: 4,
              border: '1px dashed transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#303030'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
          >
            {entry.translated || <span style={{ color: '#555' }}>点击输入翻译...</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="entry-actions">
        {isTranslating ? (
          <Spin size="small" />
        ) : (
          <>
            <Tooltip title="AI翻译">
              <Button
                size="small"
                type="text"
                icon={<TranslationOutlined />}
                onClick={() => onTranslate(entry)}
              />
            </Tooltip>
            <Tooltip title="AI润色">
              <Button
                size="small"
                type="text"
                icon={<HighlightOutlined />}
                onClick={() => onPolish(entry)}
                disabled={!entry.translated}
              />
            </Tooltip>
            <Tooltip title="标记为已审核">
              <Button
                size="small"
                type="text"
                icon={<CheckCircleOutlined />}
                onClick={() => onUpdateEntry(entry.id, { status: 'reviewed' })}
                disabled={!entry.translated}
              />
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}

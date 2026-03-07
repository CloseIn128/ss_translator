import React, { useState, useCallback, useMemo } from 'react';
import { Button, Input, Card, Table, Tag, Space, Divider, Statistic, Alert, Tabs, Tooltip, Modal } from 'antd';
import {
  FolderOpenOutlined,
  DeleteOutlined,
  CheckOutlined,
  SyncOutlined,
  FileTextOutlined,
  SaveOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTask } from '../context/TaskContext';

const api = window.electronAPI;

// ─── Mod Prompt Tab ─────────────────────────────────────────────────

function ModPromptTab({ modPrompt, onModPromptChange, messageApi }) {
  const [localPrompt, setLocalPrompt] = useState(modPrompt || '');

  // Sync with parent when prop changes
  React.useEffect(() => {
    setLocalPrompt(modPrompt || '');
  }, [modPrompt]);

  const handleSave = () => {
    onModPromptChange(localPrompt);
    messageApi.success('MOD专属提示词已保存');
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="MOD专属提示词"
        description="在此输入关于这个MOD的背景设定、翻译风格偏好等信息。这些内容会在AI翻译时自动注入到上下文中，帮助AI更好地理解并翻译MOD内容。"
        style={{ marginBottom: 16 }}
      />
      <Input.TextArea
        value={localPrompt}
        onChange={e => setLocalPrompt(e.target.value)}
        placeholder={`示例：\n这是一个以银河战争为背景的MOD，主要讲述"星际联盟"与"暗影帝国"之间的对抗。\n翻译风格偏硬科幻军事风格，使用正式、简洁的军事用语。\n"Stellaris"在本MOD中特指一种能量武器系统，应翻译为"星能武器"。`}
        rows={8}
        style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }}
      />
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
        保存提示词
      </Button>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
        提示词保存后，所有AI翻译和润色操作都会自动包含这些信息。保存项目时会一起保存。
      </div>
    </div>
  );
}

// ─── Legacy Translation Tab ───────────────────────────────────────────

function LegacyTranslationTab({ project, onBatchUpdate, messageApi }) {
  const { addLog } = useTask();
  const [legacyInfo, setLegacyInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [matchResult, setMatchResult] = useState(null); // { matches, unmatched }
  const [matching, setMatching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeMatchTab, setActiveMatchTab] = useState('matched');

  const handleLoadLegacy = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.loadLegacyMod();
      if (!result) { setLoading(false); return; } // canceled
      if (result.success) {
        setLegacyInfo(result.data);
        setMatchResult(null);
        addLog('success', `已加载老版本汉化: ${result.data.modInfo.name} (${result.data.entryCount} 条)`, '老版本汉化');
        messageApi.success(`已加载老版本汉化: ${result.data.entryCount} 条文本`);
      } else {
        addLog('error', `加载失败: ${result.error}`, '老版本汉化');
        messageApi.error(result.error || '加载失败');
      }
    } catch (err) {
      addLog('error', `加载出错: ${err.message}`, '老版本汉化');
      messageApi.error('加载出错: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [messageApi, addLog]);

  const handleClearLegacy = useCallback(async () => {
    await api.clearLegacy();
    setLegacyInfo(null);
    setMatchResult(null);
    addLog('info', '已清除老版本汉化数据', '老版本汉化');
    messageApi.info('已清除老版本汉化数据');
  }, [messageApi, addLog]);

  const handleMatch = useCallback(async () => {
    if (!project || !legacyInfo) return;

    setMatching(true);
    addLog('info', '开始匹配翻译...', '老版本汉化');
    try {
      const result = await api.matchLegacy({ entries: project.entries });
      if (result?.success) {
        setMatchResult(result.data);
        const matchCount = result.data.matches.length;
        const unmatchCount = result.data.unmatched.length;
        const msg = `匹配完成：${matchCount} 条匹配，${unmatchCount} 条未匹配`;
        addLog('success', msg, '老版本汉化');
        messageApi.success(msg);
      } else {
        addLog('error', `匹配失败: ${result?.error}`, '老版本汉化');
        messageApi.error(result?.error || '匹配失败');
      }
    } catch (err) {
      addLog('error', `匹配出错: ${err.message}`, '老版本汉化');
      messageApi.error('匹配出错: ' + err.message);
    } finally {
      setMatching(false);
    }
  }, [project, legacyInfo, messageApi, addLog]);

  const handleApplyAll = useCallback(() => {
    if (!matchResult || !matchResult.matches.length) return;

    Modal.confirm({
      title: '应用匹配翻译',
      content: `将把 ${matchResult.matches.length} 条匹配的老版本翻译应用到当前项目，已有翻译的条目将被覆盖。是否继续？`,
      okText: '确认应用',
      cancelText: '取消',
      onOk() {
        const updates = matchResult.matches.map(m => ({
          id: m.entryId,
          translated: m.legacyText,
          status: 'translated',
        }));
        onBatchUpdate(updates);
        addLog('success', `已应用 ${updates.length} 条老版本翻译`, '老版本汉化');
        messageApi.success(`已应用 ${updates.length} 条老版本翻译`);
      },
    });
  }, [matchResult, onBatchUpdate, messageApi, addLog]);

  const handleApplyUntranslatedOnly = useCallback(() => {
    if (!matchResult || !matchResult.matches.length || !project) return;

    // Only apply to entries that are currently untranslated
    const untranslatedIds = new Set(
      project.entries.filter(e => e.status === 'untranslated').map(e => e.id)
    );
    const toApply = matchResult.matches.filter(m => untranslatedIds.has(m.entryId));

    if (toApply.length === 0) {
      messageApi.info('没有需要应用的条目（所有匹配条目均已翻译）');
      return;
    }

    Modal.confirm({
      title: '应用到未翻译条目',
      content: `将把 ${toApply.length} 条匹配的老版本翻译应用到当前未翻译的条目（已翻译的不覆盖）。是否继续？`,
      okText: '确认应用',
      cancelText: '取消',
      onOk() {
        const updates = toApply.map(m => ({
          id: m.entryId,
          translated: m.legacyText,
          status: 'translated',
        }));
        onBatchUpdate(updates);
        addLog('success', `已应用 ${updates.length} 条老版本翻译（仅未翻译）`, '老版本汉化');
        messageApi.success(`已应用 ${updates.length} 条老版本翻译`);
      },
    });
  }, [matchResult, project, onBatchUpdate, messageApi, addLog]);

  // Build enriched match data for table display
  const entryMap = useMemo(() => {
    if (!project) return new Map();
    return new Map(project.entries.map(e => [e.id, e]));
  }, [project]);

  const matchedTableData = useMemo(() => {
    if (!matchResult) return [];
    return matchResult.matches.map((m, i) => {
      const entry = entryMap.get(m.entryId);
      return {
        key: i,
        entryId: m.entryId,
        original: entry?.original || '',
        currentTranslation: entry?.translated || '',
        legacyText: m.legacyText,
        matchType: m.matchType,
        context: entry?.context || '',
        status: entry?.status || 'untranslated',
      };
    });
  }, [matchResult, entryMap]);

  const unmatchedTableData = useMemo(() => {
    if (!matchResult) return [];
    return matchResult.unmatched.map((u, i) => {
      const entry = entryMap.get(u.entryId);
      return {
        key: i,
        entryId: u.entryId,
        original: entry?.original || u.original || '',
        context: entry?.context || u.context || '',
        status: entry?.status || 'untranslated',
      };
    });
  }, [matchResult, entryMap]);

  // Filter by search text
  const filteredMatched = searchText.trim()
    ? matchedTableData.filter(r =>
        r.original.toLowerCase().includes(searchText.toLowerCase()) ||
        r.legacyText.toLowerCase().includes(searchText.toLowerCase()) ||
        r.context.toLowerCase().includes(searchText.toLowerCase())
      )
    : matchedTableData;

  const filteredUnmatched = searchText.trim()
    ? unmatchedTableData.filter(r =>
        r.original.toLowerCase().includes(searchText.toLowerCase()) ||
        r.context.toLowerCase().includes(searchText.toLowerCase())
      )
    : unmatchedTableData;

  const matchedColumns = [
    {
      title: '原文',
      dataIndex: 'original',
      key: 'original',
      width: '30%',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <span style={{ fontSize: 12 }}>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '老版本翻译',
      dataIndex: 'legacyText',
      key: 'legacyText',
      width: '30%',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <span style={{ fontSize: 12, color: '#52c41a' }}>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '当前翻译',
      dataIndex: 'currentTranslation',
      key: 'currentTranslation',
      width: '20%',
      ellipsis: true,
      render: (text) => text
        ? <span style={{ fontSize: 12, color: '#1890ff' }}>{text}</span>
        : <span style={{ fontSize: 12, color: '#555' }}>—</span>,
    },
    {
      title: '匹配方式',
      dataIndex: 'matchType',
      key: 'matchType',
      width: '10%',
      filters: [
        { text: '完全匹配', value: 'exact' },
        { text: '结构匹配', value: 'structural' },
      ],
      onFilter: (value, record) => record.matchType === value,
      render: (type) => (
        <Tag color={type === 'exact' ? 'green' : 'blue'} style={{ fontSize: 11 }}>
          {type === 'exact' ? '完全' : '结构'}
        </Tag>
      ),
    },
    {
      title: '上下文',
      dataIndex: 'context',
      key: 'context',
      width: '10%',
      ellipsis: true,
      render: (text) => <span style={{ fontSize: 11, color: '#8c8c8c' }}>{text}</span>,
    },
  ];

  const unmatchedColumns = [
    {
      title: '原文',
      dataIndex: 'original',
      key: 'original',
      width: '50%',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <span style={{ fontSize: 12 }}>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: '15%',
      render: (status) => {
        const map = {
          untranslated: { label: '未翻译', color: 'default' },
          translated: { label: '已翻译', color: 'success' },
          polished: { label: '已润色', color: 'processing' },
        };
        const info = map[status] || map.untranslated;
        return <Tag color={info.color} style={{ fontSize: 11 }}>{info.label}</Tag>;
      },
    },
    {
      title: '上下文',
      dataIndex: 'context',
      key: 'context',
      width: '35%',
      ellipsis: true,
      render: (text) => <span style={{ fontSize: 11, color: '#8c8c8c' }}>{text}</span>,
    },
  ];

  return (
    <div>
      {/* Load legacy mod section */}
      <Card size="small" title="加载老版本汉化" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleLoadLegacy}
            loading={loading}
            size="small"
          >
            选择老版本汉化MOD文件夹
          </Button>
          {legacyInfo && (
            <>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleClearLegacy}
              >
                清除
              </Button>
              <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>
                已加载: {legacyInfo.modInfo?.name || '未知'} v{legacyInfo.modInfo?.version || '?'} ({legacyInfo.entryCount} 条文本)
              </span>
            </>
          )}
        </div>

        {!legacyInfo && (
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            <InfoCircleOutlined style={{ marginRight: 4 }} />
            选择老版本的已汉化MOD文件夹，程序将解析其中的中文文本并与当前项目进行匹配。
            匹配成功的条目可直接应用老版本翻译，保持翻译风格和用词一致。
          </div>
        )}
      </Card>

      {/* Matching section */}
      {legacyInfo && project && (
        <Card size="small" title="翻译匹配" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={handleMatch}
              loading={matching}
              size="small"
            >
              匹配翻译
            </Button>
            {matchResult && (
              <>
                <Button
                  icon={<CheckOutlined />}
                  onClick={handleApplyUntranslatedOnly}
                  size="small"
                  disabled={!matchResult.matches.length}
                >
                  应用到未翻译条目
                </Button>
                <Button
                  icon={<CheckOutlined />}
                  onClick={handleApplyAll}
                  size="small"
                  disabled={!matchResult.matches.length}
                >
                  应用所有匹配
                </Button>
              </>
            )}
          </div>

          {matchResult && (
            <>
              <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                <Statistic title="匹配成功" value={matchResult.matches.length} valueStyle={{ color: '#52c41a', fontSize: 20 }} />
                <Statistic
                  title="完全匹配"
                  value={matchResult.matches.filter(m => m.matchType === 'exact').length}
                  valueStyle={{ color: '#52c41a', fontSize: 20 }}
                />
                <Statistic
                  title="结构匹配"
                  value={matchResult.matches.filter(m => m.matchType === 'structural').length}
                  valueStyle={{ color: '#1890ff', fontSize: 20 }}
                />
                <Statistic title="未匹配" value={matchResult.unmatched.length} valueStyle={{ color: '#faad14', fontSize: 20 }} />
              </div>

              <Input
                placeholder="搜索原文、翻译、上下文..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
                size="small"
                style={{ width: 300, marginBottom: 12 }}
              />

              <Tabs
                activeKey={activeMatchTab}
                onChange={setActiveMatchTab}
                size="small"
                items={[
                  {
                    key: 'matched',
                    label: `已匹配 (${filteredMatched.length})`,
                    children: (
                      <Table
                        dataSource={filteredMatched}
                        columns={matchedColumns}
                        size="small"
                        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
                      />
                    ),
                  },
                  {
                    key: 'unmatched',
                    label: `未匹配 (${filteredUnmatched.length})`,
                    children: (
                      <Table
                        dataSource={filteredUnmatched}
                        columns={unmatchedColumns}
                        size="small"
                        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
                      />
                    ),
                  },
                ]}
              />
            </>
          )}
        </Card>
      )}

      {/* No project loaded */}
      {!project && legacyInfo && (
        <Alert
          type="warning"
          message="请先加载翻译项目"
          description="需要先打开MOD或加载翻译项目，才能匹配老版本翻译。"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Help card */}
      <Card size="small" title="使用说明" style={{ marginTop: 16 }}>
        <ul style={{ fontSize: 13, color: '#8c8c8c', paddingLeft: 16, margin: 0 }}>
          <li><b>老版本汉化加载</b>：选择同一MOD的旧版已汉化文件夹，程序会解析其中的中文文本</li>
          <li><b>匹配翻译</b>：将老版本的中文文本与当前项目的英文条目进行结构匹配</li>
          <li><b>完全匹配</b>：文件路径、条目ID和字段完全相同（最可靠）</li>
          <li><b>结构匹配</b>：文件名、行ID和字段相同但路径不同（适应版本间目录变化）</li>
          <li><b>应用到未翻译条目</b>：仅将匹配结果应用到当前未翻译的条目，不覆盖已有翻译</li>
          <li><b>应用所有匹配</b>：将所有匹配结果应用到项目，会覆盖已有翻译</li>
          <li>应用后可通过AI润色功能进一步优化翻译质量</li>
        </ul>
      </Card>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────

export default function LegacyTranslation({ project, modPrompt, onModPromptChange, onBatchUpdate, messageApi }) {
  const tabItems = [
    {
      key: 'legacy',
      label: <><FileTextOutlined /> 老版本汉化</>,
      children: (
        <LegacyTranslationTab
          project={project}
          onBatchUpdate={onBatchUpdate}
          messageApi={messageApi}
        />
      ),
    },
    {
      key: 'modPrompt',
      label: <><SaveOutlined /> MOD专属提示词</>,
      children: (
        <ModPromptTab
          modPrompt={modPrompt}
          onModPromptChange={onModPromptChange}
          messageApi={messageApi}
        />
      ),
    },
  ];

  return (
    <div style={{ height: '100%' }}>
      <Tabs items={tabItems} size="small" />
    </div>
  );
}

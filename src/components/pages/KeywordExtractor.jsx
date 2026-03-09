import React, { useState } from 'react';
import { Button, Tooltip, Divider, Switch } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  RobotOutlined,
  TranslationOutlined,
  HighlightOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import useKeywordActions from './keyword/useKeywordActions';
import KeywordTable from './keyword/KeywordTable';

export default function KeywordExtractor({ project, onUpdateKeywords, onUpdateGlossary, messageApi }) {
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const {
    keywords,
    extracting,
    translating,
    polishing,
    extractPhase,
    enableAI,
    setEnableAI,
    isTaskRunning,
    handleExtractAll,
    handleTranslateAll,
    handleTranslateSelected,
    handlePolishAll,
    confirmSelected,
    toggleConfirmed,
    handleAddSelectedToGlossary,
    handleAddAllToGlossary,
    updateKeyword,
  } = useKeywordActions({ project, onUpdateKeywords, onUpdateGlossary, messageApi });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <Tooltip title="开启后提取关键词时同时使用AI智能提取">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8c8c8c' }}>
            <RobotOutlined />
            AI提取
            <Switch size="small" checked={enableAI} onChange={setEnableAI} disabled={extracting} />
          </span>
        </Tooltip>
        <Button
          type="primary"
          size="small"
          icon={<SearchOutlined />}
          onClick={handleExtractAll}
          loading={extracting}
          disabled={isTaskRunning && !extracting}
        >
          提取关键词
        </Button>
        {keywords.length > 0 && (
          <>
            <Button
              size="small"
              icon={<TranslationOutlined />}
              onClick={handleTranslateAll}
              loading={translating}
              disabled={extracting || (isTaskRunning && !translating)}
            >
              翻译全部
            </Button>
            <Button
              size="small"
              icon={<TranslationOutlined />}
              onClick={() => handleTranslateSelected(selectedRowKeys)}
              loading={translating}
              disabled={selectedRowKeys.length === 0 || extracting || (isTaskRunning && !translating)}
            >
              翻译选中 ({selectedRowKeys.length})
            </Button>
            <Button
              size="small"
              icon={<HighlightOutlined />}
              onClick={handlePolishAll}
              loading={polishing}
              disabled={extracting || (isTaskRunning && !polishing)}
            >
              润色全部
            </Button>
            <Button
              size="small"
              icon={<CheckOutlined />}
              onClick={() => confirmSelected(selectedRowKeys)}
              disabled={selectedRowKeys.length === 0 || extracting}
            >
              确认选中 ({selectedRowKeys.length})
            </Button>
            <Divider type="vertical" />
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={handleAddAllToGlossary}
              disabled={extracting || isTaskRunning}
            >
              全部加入术语库
            </Button>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleAddSelectedToGlossary(selectedRowKeys, () => setSelectedRowKeys([]))}
              disabled={selectedRowKeys.length === 0 || extracting || isTaskRunning}
            >
              选中加入术语库 ({selectedRowKeys.length})
            </Button>
          </>
        )}
      </div>

      {/* Extraction progress */}
      {extracting && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <RobotOutlined spin style={{ color: '#1677ff' }} />
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>
            {extractPhase === 'structure' && '正在进行结构化提取...'}
            {extractPhase === 'ai' && `AI智能提取中... 已发现 ${keywords.filter(k => k.extractType === 'ai').length} 个关键词`}
          </span>
        </div>
      )}

      {/* Empty state */}
      {keywords.length === 0 && !extracting && (
        <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
          <SearchOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div style={{ marginBottom: 8 }}>在基本信息页设置MOD文件夹后提取关键词</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            点击"提取关键词"将执行<b>结构提取</b>，开启AI提取开关时同时执行<b>AI智能提取</b>
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            结构提取基于MOD文件结构快速识别舰船名、武器名、势力名等字段
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            AI智能提取通过AI分析文本内容，识别隐藏在描述和对话中的专有名词
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
            提取完成后，可选择关键词进行<b>翻译</b>，再添加到词库
          </div>
        </div>
      )}

      {/* Keyword table */}
      {(keywords.length > 0 || extracting) && (
        <KeywordTable
          keywords={keywords}
          selectedRowKeys={selectedRowKeys}
          onSelectedRowKeysChange={setSelectedRowKeys}
          toggleConfirmed={toggleConfirmed}
          updateKeyword={updateKeyword}
        />
      )}
    </div>
  );
}

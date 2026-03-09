import { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from 'antd';
import { useTask } from '../../context/TaskContext';

const api = window.electronAPI;

/**
 * Custom hook for keyword extraction, translation, polishing and glossary operations.
 * Manages keyword state, event listeners, and all related business logic.
 */
export default function useKeywordActions({ project, onUpdateKeywords, onUpdateGlossary, messageApi }) {
  const { addLog, startTask, updateTaskProgress, completeTask, failTask, isTaskRunning } = useTask();
  const [keywords, setKeywords] = useState(() => project?.keywords || []);
  const [extracting, setExtracting] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [extractPhase, setExtractPhase] = useState('');
  const [enableAI, setEnableAI] = useState(true);
  const keyCounterRef = useRef(project?.keywords?.length || 0);
  const batchHandlerRef = useRef(null);
  const logHandlerRef = useRef(null);

  // Sync keywords back to project whenever they change
  useEffect(() => {
    if (onUpdateKeywords) {
      onUpdateKeywords(keywords);
    }
  }, [keywords, onUpdateKeywords]);

  // Reset keywords when a different project is loaded
  useEffect(() => {
    const loaded = project?.keywords || [];
    setKeywords(loaded);
    keyCounterRef.current = loaded.length;
  }, [project?.id]);

  // Sync from project.keywords when translations arrive
  useEffect(() => {
    const projKw = project?.keywords;
    if (!projKw) return;
    setKeywords(prev => {
      if (prev === projKw) return prev;
      if (prev.length === projKw.length) {
        let same = true;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].target !== projKw[i].target || prev[i].source !== projKw[i].source) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      keyCounterRef.current = projKw.length;
      return projKw;
    });
  }, [project?.keywords]);

  // Register / cleanup the keywords:batch event listener
  useEffect(() => {
    const handler = api.onKeywordBatch((data) => {
      if (data.phase === 'complete') {
        setExtracting(false);
        setExtractPhase('');
        return;
      }

      setExtractPhase(data.phase);

      if (data.keywords && data.keywords.length > 0) {
        const counter = keyCounterRef.current;
        const newItems = data.keywords.map((kw, i) => ({
          ...kw,
          key: `${kw.extractType}_${counter + i}`,
          target: kw.target || '',
          category: kw.category || '通用',
        }));
        keyCounterRef.current = counter + newItems.length;
        setKeywords(prev => [...prev, ...newItems]);
        addLog('debug', `[${data.phase}] 发现 ${newItems.length} 个关键词`, '关键词提取');
      }
    });
    batchHandlerRef.current = handler;

    return () => {
      if (batchHandlerRef.current) {
        api.removeKeywordBatchListener(batchHandlerRef.current);
        batchHandlerRef.current = null;
      }
    };
  }, []);

  // Register / cleanup the keywords:log event listener
  useEffect(() => {
    const handler = api.onKeywordLog((data) => {
      addLog(data.level, data.message, '关键词提取');
    });
    logHandlerRef.current = handler;

    return () => {
      if (logHandlerRef.current) {
        api.removeKeywordLogListener(logHandlerRef.current);
        logHandlerRef.current = null;
      }
    };
  }, []);

  // ─── Confirmed status toggle ──────────────────────────────────────
  const toggleConfirmed = useCallback((key) => {
    setKeywords(prev => {
      const updated = prev.map(kw =>
        kw.key === key ? { ...kw, confirmed: !kw.confirmed } : kw
      );
      if (onUpdateKeywords) onUpdateKeywords(updated);
      return updated;
    });
  }, [onUpdateKeywords]);

  const confirmSelected = useCallback((selectedRowKeys) => {
    if (selectedRowKeys.length === 0) return;
    const selectedSet = new Set(selectedRowKeys);
    setKeywords(prev => {
      const updated = prev.map(kw =>
        selectedSet.has(kw.key) ? { ...kw, confirmed: true } : kw
      );
      if (onUpdateKeywords) onUpdateKeywords(updated);
      return updated;
    });
    messageApi.success(`已确认 ${selectedRowKeys.length} 个关键词`);
  }, [onUpdateKeywords, messageApi]);

  // ─── Extraction ───────────────────────────────────────────────────
  const doExtract = useCallback(async () => {
    const targetPath = project?.modPath;
    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }
    const taskId = startTask('关键词提取');
    if (!taskId) {
      messageApi.warning('已有任务正在执行');
      return;
    }
    setExtracting(true);
    setKeywords([]);
    keyCounterRef.current = 0;
    setExtractPhase('structure');
    addLog('info', `开始提取关键词: ${targetPath}`, '关键词提取');
    updateTaskProgress('结构提取中...');
    try {
      const result = await api.extractAllKeywords({
        modPath: targetPath,
        glossary: project?.glossary || [],
        skipAI: !enableAI,
      });
      if (result?.success) {
        const msg = `提取完成：结构提取 ${result.total.structure} 个，AI提取 ${result.total.ai} 个`;
        addLog('success', msg, '关键词提取');
        completeTask(msg);
        messageApi.success(msg);
      } else {
        const errMsg = result?.error || '关键词提取失败';
        addLog('error', errMsg, '关键词提取');
        failTask(errMsg);
        messageApi.error(errMsg);
      }
    } catch (err) {
      addLog('error', `提取出错: ${err.message}`, '关键词提取');
      failTask(`提取出错: ${err.message}`);
      messageApi.error('提取出错: ' + err.message);
      setExtracting(false);
      setExtractPhase('');
    }
  }, [project, enableAI, isTaskRunning, startTask, updateTaskProgress, completeTask, failTask, addLog, messageApi]);

  const handleExtractAll = useCallback(async () => {
    const targetPath = project?.modPath;
    if (!targetPath) {
      messageApi.warning('请先在基本信息页设置MOD文件夹路径');
      return;
    }
    if (keywords.length > 0) {
      Modal.confirm({
        title: '重新提取关键词',
        content: `当前已有 ${keywords.length} 个关键词，重新提取将覆盖现有结果。是否继续？`,
        okText: '确认提取',
        cancelText: '取消',
        onOk() { (async () => { await doExtract(); })(); },
      });
      return;
    }
    await doExtract();
  }, [project?.modPath, keywords.length, doExtract, messageApi]);

  // ─── Translation ──────────────────────────────────────────────────
  const doTranslate = useCallback(async (toTranslate, extraGlossary = []) => {
    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }
    const taskId = startTask(`翻译 ${toTranslate.length} 个关键词`);
    if (!taskId) {
      messageApi.warning('已有任务正在执行');
      return;
    }
    setTranslating(true);
    addLog('info', `开始翻译 ${toTranslate.length} 个关键词`, '关键词提取');
    try {
      const result = await api.translateKeywords({
        keywords: toTranslate.map(kw => ({ source: kw.source, category: kw.category })),
        extraGlossary: extraGlossary,
      });
      if (result?.success) {
        const translationMap = new Map();
        for (const item of result.data) {
          if (item.source && item.target) {
            translationMap.set(item.source.toLowerCase(), item.target);
          }
        }
        const updatedKeywords = toTranslate.map(kw => {
          const translation = translationMap.get(kw.source.toLowerCase());
          return translation ? { ...kw, target: translation } : kw;
        });
        const fullMap = new Map(updatedKeywords.map(kw => [kw.key, kw]));
        setKeywords(prev => {
          const merged = prev.map(kw => fullMap.get(kw.key) || kw);
          if (onUpdateKeywords) onUpdateKeywords(merged);
          return merged;
        });
        const translated = result.data.filter(d => d.target).length;
        const msg = `已翻译 ${translated} 个关键词`;
        addLog('success', msg, '关键词提取');
        completeTask(msg);
        messageApi.success(msg);
      } else {
        const errMsg = result?.error || '关键词翻译失败';
        addLog('error', errMsg, '关键词提取');
        failTask(errMsg);
        messageApi.error(errMsg);
      }
    } catch (err) {
      addLog('error', `翻译出错: ${err.message}`, '关键词提取');
      failTask(`翻译出错: ${err.message}`);
      messageApi.error('翻译出错: ' + err.message);
    } finally {
      setTranslating(false);
    }
  }, [isTaskRunning, startTask, completeTask, failTask, addLog, messageApi, onUpdateKeywords]);

  const handleTranslateSelected = useCallback(async (selectedRowKeys) => {
    if (selectedRowKeys.length === 0) {
      messageApi.warning('请先勾选要翻译的关键词');
      return;
    }
    const keywordMap = new Map(keywords.map(kw => [kw.key, kw]));
    const toTranslate = selectedRowKeys
      .map(k => keywordMap.get(k))
      .filter(Boolean);
    if (toTranslate.length === 0) return;
    await doTranslate(toTranslate);
  }, [keywords, doTranslate, messageApi]);

  const handleTranslateAll = useCallback(async () => {
    if (keywords.length === 0) return;
    const unconfirmed = keywords.filter(kw => !kw.confirmed);
    if (unconfirmed.length === 0) {
      messageApi.info('所有关键词已确认，无需翻译');
      return;
    }
    const confirmedGlossary = keywords
      .filter(kw => kw.confirmed && kw.target && kw.target.trim())
      .map(kw => ({ source: kw.source, target: kw.target, category: kw.category }));
    await doTranslate(unconfirmed, confirmedGlossary);
  }, [keywords, doTranslate, messageApi]);

  // ─── Polish ───────────────────────────────────────────────────────
  const doPolish = useCallback(async (toPolish, extraGlossary = []) => {
    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }
    const taskId = startTask(`润色 ${toPolish.length} 个关键词`);
    if (!taskId) {
      messageApi.warning('已有任务正在执行');
      return;
    }
    setPolishing(true);
    addLog('info', `开始润色 ${toPolish.length} 个关键词`, '关键词提取');
    try {
      const result = await api.polishKeywords({
        keywords: toPolish.map(kw => ({ source: kw.source, target: kw.target || '', category: kw.category })),
        extraGlossary: extraGlossary,
      });
      if (result?.success) {
        const polishMap = new Map();
        for (const item of result.data) {
          if (item.source && item.target) {
            polishMap.set(item.source.toLowerCase(), item.target);
          }
        }
        setKeywords(prev => {
          const merged = prev.map(kw => {
            const polished = polishMap.get(kw.source.toLowerCase());
            return polished ? { ...kw, target: polished } : kw;
          });
          if (onUpdateKeywords) onUpdateKeywords(merged);
          return merged;
        });
        const origMap = new Map(toPolish.map(kw => [kw.source.toLowerCase(), kw.target || '']));
        const changed = result.data.filter(d => {
          const origTarget = origMap.get(d.source?.toLowerCase());
          return origTarget !== undefined && d.target !== origTarget;
        }).length;
        const msg = `润色完成，${changed} 个术语有变更`;
        addLog('success', msg, '关键词提取');
        completeTask(msg);
        messageApi.success(msg);
      } else {
        const errMsg = result?.error || '关键词润色失败';
        addLog('error', errMsg, '关键词提取');
        failTask(errMsg);
        messageApi.error(errMsg);
      }
    } catch (err) {
      addLog('error', `润色出错: ${err.message}`, '关键词提取');
      failTask(`润色出错: ${err.message}`);
      messageApi.error('润色出错: ' + err.message);
    } finally {
      setPolishing(false);
    }
  }, [isTaskRunning, startTask, completeTask, failTask, addLog, messageApi, onUpdateKeywords]);

  const handlePolishAll = useCallback(async () => {
    const unconfirmed = keywords.filter(kw => !kw.confirmed);
    const translated = unconfirmed.filter(kw => kw.target && kw.target.trim());
    if (translated.length === 0) {
      messageApi.warning('没有未确认的已翻译术语可润色');
      return;
    }
    const confirmedGlossary = keywords
      .filter(kw => kw.confirmed && kw.target && kw.target.trim())
      .map(kw => ({ source: kw.source, target: kw.target, category: kw.category }));
    await doPolish(translated, confirmedGlossary);
  }, [keywords, doPolish, messageApi]);

  // ─── Add to glossary ──────────────────────────────────────────────
  const doAddToGlossary = useCallback(async (kwList, onDone) => {
    const glossary = project.glossary || [];
    const existingMap = new Map(glossary.map(g => [g.source, g]));

    const newKws = kwList.filter(kw => kw && !existingMap.has(kw.source));
    const overlapKws = kwList.filter(kw => kw && existingMap.has(kw.source));

    const doAdd = async () => {
      let added = 0;
      let updated = 0;
      const newEntries = [];
      const updatedGlossary = [...glossary];

      for (const kw of newKws) {
        const result = await api.addGlossaryEntry({
          projectId: project.id,
          source: kw.source,
          target: kw.target || '',
          category: kw.category || '通用',
        });
        if (result) {
          newEntries.push(result);
          added++;
        }
      }

      for (const kw of overlapKws) {
        const existing = existingMap.get(kw.source);
        if (existing) {
          const result = await api.updateGlossaryEntry({
            projectId: project.id,
            id: existing.id,
            source: kw.source,
            target: kw.target || '',
            category: kw.category || '通用',
          });
          if (result) {
            const idx = updatedGlossary.findIndex(g => g.id === existing.id);
            if (idx >= 0) {
              updatedGlossary[idx] = { ...updatedGlossary[idx], target: kw.target || '', category: kw.category || '通用' };
            }
            updated++;
          }
        }
      }

      if ((added > 0 || updated > 0) && onUpdateGlossary) {
        onUpdateGlossary([...updatedGlossary, ...newEntries]);
      }
      const parts = [];
      if (added > 0) parts.push(`新增 ${added} 个`);
      if (updated > 0) parts.push(`覆盖 ${updated} 个`);
      messageApi.success(`已${parts.join('，')}术语到词库`);
      if (onDone) onDone();
    };

    if (overlapKws.length > 0) {
      Modal.confirm({
        title: '覆盖确认',
        content: `${newKws.length > 0 ? `将新增 ${newKws.length} 个术语。` : ''}术语库中已存在 ${overlapKws.length} 个同名条目，覆盖将更新它们的译文和分类。是否继续？`,
        okText: '确认覆盖',
        cancelText: '取消',
        onOk: doAdd,
      });
    } else {
      await doAdd();
    }
  }, [project, onUpdateGlossary, messageApi]);

  const handleAddSelectedToGlossary = useCallback(async (selectedRowKeys, onDone) => {
    if (!project) {
      messageApi.warning('请先加载翻译项目，再添加到词库');
      return;
    }
    if (selectedRowKeys.length === 0) {
      messageApi.warning('请先勾选要添加的关键词');
      return;
    }
    const keywordMap = new Map(keywords.map(kw => [kw.key, kw]));
    const kwList = selectedRowKeys.map(k => keywordMap.get(k)).filter(Boolean);
    if (kwList.length === 0) return;
    await doAddToGlossary(kwList, onDone);
  }, [project, keywords, doAddToGlossary, messageApi]);

  const handleAddAllToGlossary = useCallback(async () => {
    if (!project) {
      messageApi.warning('请先加载翻译项目，再添加到词库');
      return;
    }
    if (keywords.length === 0) {
      messageApi.warning('没有可添加的关键词');
      return;
    }
    await doAddToGlossary(keywords);
  }, [project, keywords, doAddToGlossary, messageApi]);

  // ─── Inline editing ───────────────────────────────────────────────
  const updateKeyword = useCallback((key, field, value) => {
    setKeywords(prev => {
      const updated = prev.map(kw =>
        kw.key === key ? { ...kw, [field]: value } : kw
      );
      if (onUpdateKeywords) onUpdateKeywords(updated);
      return updated;
    });
  }, [onUpdateKeywords]);

  return {
    keywords,
    extracting,
    translating,
    polishing,
    extractPhase,
    enableAI,
    setEnableAI,
    isTaskRunning,
    // Actions
    handleExtractAll,
    handleTranslateAll,
    handleTranslateSelected,
    handlePolishAll,
    confirmSelected,
    toggleConfirmed,
    handleAddSelectedToGlossary,
    handleAddAllToGlossary,
    updateKeyword,
  };
}

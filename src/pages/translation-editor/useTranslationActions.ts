import { useState, useCallback, useRef, useEffect } from 'react';
import { Modal } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { useTask } from '../../components/context/TaskContext';
import type { Project, TranslationEntry, GlossaryEntry } from '../../../types';

const api = window.electronAPI;

interface UseTranslationActionsOptions {
  project: Project | null;
  filteredEntries: TranslationEntry[];
  mergedGlossary: GlossaryEntry[];
  onUpdateEntry: (entryId: string, updates: Record<string, any>) => void;
  onBatchUpdate: (updates: Array<{ id: string; [key: string]: any }>) => void;
  messageApi: MessageInstance;
}

export default function useTranslationActions({
  project,
  filteredEntries,
  mergedGlossary,
  onUpdateEntry,
  onBatchUpdate,
  messageApi,
}: UseTranslationActionsOptions) {
  const { addLog, startTask, updateTaskProgress, completeTask, failTask, isTaskRunning, isTaskCancelled } = useTask();
  const modPrompt = project?.modPrompt || '';
  const progressHandlerRef = useRef<(() => void) | null>(null);
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [batchTranslating, setBatchTranslating] = useState(false);

  // Cleanup progress event listeners on unmount
  useEffect(() => {
    return () => {
      if (progressHandlerRef.current) {
        api.removeTranslateProgressListener(progressHandlerRef.current);
        api.removePolishProgressListener(progressHandlerRef.current);
        progressHandlerRef.current = null;
      }
    };
  }, []);

  // Translate single entry
  const handleTranslate = useCallback(async (entry: TranslationEntry) => {
    setTranslatingIds(prev => new Set(prev).add(entry.id));
    addLog('info', `翻译条目: ${entry.original.slice(0, 60)}...`, '翻译编辑');
    try {
      const result = await api.translate({
        entries: [{ id: entry.id, source: entry.original, context: entry.context }],
        glossary: mergedGlossary,
        modPrompt,
      });
      if (result?.success && result.data && result.data.length > 0) {
        const t = result.data[0];
        onUpdateEntry(entry.id, { translated: t.translated || t.target, status: t.status || 'translated' });
        if (t.status === 'error') {
          addLog('error', `翻译失败: ${t.error || '未知错误'}`, '翻译编辑');
          messageApi.error(t.error || '翻译失败');
        } else {
          addLog('success', `翻译完成: "${entry.original.slice(0, 30)}" → "${(t.translated || t.target || '').slice(0, 30)}"`, '翻译编辑');
        }
      } else {
        addLog('error', `翻译请求失败: ${result?.error || '未知错误'}`, '翻译编辑');
        messageApi.error(result?.error || '翻译请求失败');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog('error', `翻译出错: ${errMsg}`, '翻译编辑');
      messageApi.error('翻译出错: ' + errMsg);
    } finally {
      setTranslatingIds(prev => {
        const s = new Set(prev);
        s.delete(entry.id);
        return s;
      });
    }
  }, [mergedGlossary, modPrompt, onUpdateEntry, messageApi, addLog]);

  // Polish single entry
  const handlePolish = useCallback(async (entry: TranslationEntry) => {
    if (!entry.translated) {
      messageApi.warning('请先翻译该条目');
      return;
    }
    setTranslatingIds(prev => new Set(prev).add(entry.id));
    addLog('info', `润色条目: "${entry.original.slice(0, 40)}"`, '翻译编辑');
    try {
      const result = await api.polish({
        entries: [{ id: entry.id, target: entry.translated, context: entry.context }],
        glossary: mergedGlossary,
        modPrompt,
      });
      if (result?.success && result.data) {
        const t = result.data[0];
        onUpdateEntry(entry.id, { translated: t.translated || t.target, status: 'polished' });
        addLog('success', `润色完成: "${(t.translated || t.target || '').slice(0, 40)}"`, '翻译编辑');
      } else {
        addLog('error', `润色失败: ${result?.error || '未知错误'}`, '翻译编辑');
        messageApi.error(result?.error || '润色失败');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog('error', `润色出错: ${errMsg}`, '翻译编辑');
      messageApi.error('润色出错: ' + errMsg);
    } finally {
      setTranslatingIds(prev => {
        const s = new Set(prev);
        s.delete(entry.id);
        return s;
      });
    }
  }, [mergedGlossary, modPrompt, onUpdateEntry, messageApi, addLog]);

  // Clear all translations in current scope
  const handleClearTranslations = useCallback(() => {
    const translatedEntries = filteredEntries.filter((e: TranslationEntry) => !e.ignored && e.status !== 'untranslated');
    if (translatedEntries.length === 0) {
      messageApi.info('当前筛选下没有已翻译的条目');
      return;
    }

    Modal.confirm({
      title: '清空翻译',
      content: `将清空当前筛选范围内 ${translatedEntries.length} 条已翻译文本的译文，是否继续？`,
      okText: '确认清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk() {
        const updates = translatedEntries.map((e: TranslationEntry) => ({
          id: e.id,
          translated: '',
          status: 'untranslated' as const,
        }));
        onBatchUpdate(updates);
        messageApi.success(`已清空 ${translatedEntries.length} 条翻译`);
        addLog('info', `已清空 ${translatedEntries.length} 条翻译`, '翻译编辑');
      },
    });
  }, [filteredEntries, onBatchUpdate, messageApi, addLog]);

  // Batch translate all entries in current filter
  const handleBatchTranslate = useCallback(async () => {
    const targetEntries = filteredEntries.filter((e: TranslationEntry) => !e.ignored);
    if (targetEntries.length === 0) {
      messageApi.info('当前筛选下没有条目');
      return;
    }

    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }

    Modal.confirm({
      title: '批量翻译',
      content: `将翻译当前筛选范围内的 ${targetEntries.length} 条文本，是否继续？`,
      okText: '开始翻译',
      cancelText: '取消',
      onOk() {
        const taskId = startTask(`批量翻译 ${targetEntries.length} 条`);
        if (!taskId) {
          messageApi.warning('已有任务正在执行');
          return;
        }
        setBatchTranslating(true);
        addLog('info', `开始批量翻译 ${targetEntries.length} 条文本`, '翻译编辑');

        // Listen for incremental progress from backend
        if (progressHandlerRef.current) {
          api.removeTranslateProgressListener(progressHandlerRef.current);
        }
        const handler = api.onTranslateProgress(({ completed, total, batchResults }) => {
          updateTaskProgress(`${completed}/${total}`);
          if (batchResults && batchResults.length > 0) {
            onBatchUpdate(batchResults);
          }
        });
        progressHandlerRef.current = handler;

        (async () => {
          try {
            const batchInput = targetEntries.map((e: TranslationEntry) => ({
              id: e.id,
              source: e.original,
              context: e.context,
            }));
            updateTaskProgress(`0/${targetEntries.length}`);
            const result = await api.translate({
              entries: batchInput,
              glossary: mergedGlossary,
              modPrompt,
            });
            if (isTaskCancelled()) return;
            if (result?.success && result.data) {
              onBatchUpdate(result.data);
              const successCount = result.data.filter((r) => r.status === 'translated').length;
              const msg = `批量翻译完成：${successCount}/${targetEntries.length} 成功`;
              addLog('success', msg, '翻译编辑');
              for (const r of result.data.slice(0, 5)) {
                if (r.status === 'translated') {
                  addLog('debug', `"${(r.original || '').slice(0, 30)}" → "${(r.translated || '').slice(0, 30)}"`, '翻译编辑');
                }
              }
              completeTask(msg);
              messageApi.success(msg);
            } else {
              const errMsg = result?.error || '批量翻译失败';
              addLog('error', errMsg, '翻译编辑');
              failTask(errMsg);
              messageApi.error(errMsg);
            }
          } catch (err: unknown) {
            if (!isTaskCancelled()) {
              const errMsg = err instanceof Error ? err.message : String(err);
              addLog('error', `批量翻译出错: ${errMsg}`, '翻译编辑');
              failTask(`批量翻译出错: ${errMsg}`);
              messageApi.error('批量翻译出错: ' + errMsg);
            }
          } finally {
            setBatchTranslating(false);
            if (progressHandlerRef.current) {
              api.removeTranslateProgressListener(progressHandlerRef.current);
              progressHandlerRef.current = null;
            }
          }
        })();
      },
    });
  }, [filteredEntries, mergedGlossary, modPrompt, onBatchUpdate, messageApi, isTaskRunning, startTask, updateTaskProgress, completeTask, failTask, addLog, isTaskCancelled]);

  // Batch polish all translated
  const handleBatchPolish = useCallback(async () => {
    const translated = filteredEntries.filter((e: TranslationEntry) => !e.ignored && e.status === 'translated');
    if (translated.length === 0) {
      messageApi.info('当前筛选下没有可润色的条目');
      return;
    }

    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }

    Modal.confirm({
      title: '批量润色',
      content: `将润色当前筛选范围内的 ${translated.length} 条已翻译文本，是否继续？`,
      okText: '开始润色',
      cancelText: '取消',
      onOk() {
        const taskId = startTask(`批量润色 ${translated.length} 条`);
        if (!taskId) {
          messageApi.warning('已有任务正在执行');
          return;
        }
        setBatchTranslating(true);
        addLog('info', `开始批量润色 ${translated.length} 条已翻译文本`, '翻译编辑');

        if (progressHandlerRef.current) {
          api.removePolishProgressListener(progressHandlerRef.current);
        }
        const handler = api.onPolishProgress(({ completed, total, batchResults }) => {
          updateTaskProgress(`${completed}/${total}`);
          if (batchResults && batchResults.length > 0) {
            onBatchUpdate(batchResults);
          }
        });
        progressHandlerRef.current = handler;

        (async () => {
          try {
            const batchInput = translated.map((e: TranslationEntry) => ({
              id: e.id,
              target: e.translated,
              context: e.context,
            }));
            updateTaskProgress(`0/${translated.length}`);
            const result = await api.polishBatch({
              entries: batchInput,
              glossary: mergedGlossary,
              modPrompt,
            });
            if (isTaskCancelled()) return;
            if (result?.success && result.data) {
              onBatchUpdate(result.data);
              const successCount = result.data.filter((r) => r.status === 'polished').length;
              const msg = `批量润色完成：${successCount}/${translated.length} 成功`;
              addLog('success', msg, '翻译编辑');
              completeTask(msg);
              messageApi.success(msg);
            } else {
              const errMsg = result?.error || '批量润色失败';
              addLog('error', errMsg, '翻译编辑');
              failTask(errMsg);
              messageApi.error(errMsg);
            }
          } catch (err: unknown) {
            if (!isTaskCancelled()) {
              const errMsg = err instanceof Error ? err.message : String(err);
              addLog('error', `批量润色出错: ${errMsg}`, '翻译编辑');
              failTask(`批量润色出错: ${errMsg}`);
              messageApi.error('批量润色出错: ' + errMsg);
            }
          } finally {
            setBatchTranslating(false);
            if (progressHandlerRef.current) {
              api.removePolishProgressListener(progressHandlerRef.current);
              progressHandlerRef.current = null;
            }
          }
        })();
      },
    });
  }, [filteredEntries, mergedGlossary, modPrompt, onBatchUpdate, messageApi, isTaskRunning, startTask, updateTaskProgress, completeTask, failTask, addLog, isTaskCancelled]);

  return {
    translatingIds,
    batchTranslating,
    isTaskRunning,
    handleTranslate,
    handlePolish,
    handleClearTranslations,
    handleBatchTranslate,
    handleBatchPolish,
  };
}

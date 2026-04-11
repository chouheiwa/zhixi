import { useState, useRef } from 'react';
import { db } from '@/db/database';
import { exportToJSON, importFromJSON } from '@/db/export-import';
import type { useCollector } from '@/hooks/use-collector';

type Collector = ReturnType<typeof useCollector>;

interface UseSyncOrchestrationParams {
  collector: Collector;
  userId: string | undefined;
  hasSetup: boolean;
  refreshSettings: () => void;
  refresh: () => void;
  refreshAllSummaries: () => void;
}

export function useSyncOrchestration({
  collector,
  userId,
  hasSetup,
  refreshSettings,
  refresh,
  refreshAllSummaries,
}: UseSyncOrchestrationParams) {
  const {
    syncIncome,
    syncRealtimeAggr,
    fetchContentDaily: fetchContentDailyTask,
    fetchAllCreations,
    fetchTodayContentDaily,
    fetchTodayRealtime,
  } = collector;

  const [syncMsg, setSyncMsg] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [setupDate, setSetupDate] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getContentItems = async () => {
    const contentMap = new Map<
      string,
      { contentId: string; contentToken: string; contentType: string; title: string; publishDate: string }
    >();
    try {
      const creations = await fetchAllCreations();
      for (const item of creations) {
        contentMap.set(item.contentId, item);
      }
    } catch {
      /* ignore */
    }
    if (userId) {
      const incomeAll = await db.incomeRecords.where('userId').equals(userId).toArray();
      for (const r of incomeAll) {
        if (!contentMap.has(r.contentId)) {
          contentMap.set(r.contentId, {
            contentId: r.contentId,
            contentToken: r.contentToken,
            contentType: r.contentType,
            title: r.title,
            publishDate: r.publishDate,
          });
        }
      }
    }
    return Array.from(contentMap.values());
  };

  const handleSyncIncome = async (initDate?: string) => {
    setSyncMsg('');
    try {
      const result = await syncIncome(initDate);
      if (!hasSetup) refreshSettings();
      setSyncMsg(result.synced === 0 ? '收益数据已是最新' : `收益同步完成，补全 ${result.synced} 天`);
      refresh();
      refreshAllSummaries();
    } catch (err) {
      setSyncMsg(`收益同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleSyncRealtimeAggr = async () => {
    setSyncMsg('');
    try {
      const result = await syncRealtimeAggr();
      setSyncMsg(result.count === 0 ? '每日汇总已是最新' : `每日汇总完成，同步 ${result.count} 天`);
      refresh();
      refreshAllSummaries();
    } catch (err) {
      setSyncMsg(`每日汇总失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleFetchContentDaily = async () => {
    setSyncMsg('');
    try {
      setSyncMsg('正在获取内容列表...');
      const items = await getContentItems();
      if (items.length === 0) {
        setSyncMsg('没有找到内容数据');
        return;
      }
      setSyncMsg(`找到 ${items.length} 篇内容，开始拉取每日详情...`);
      const result = await fetchContentDailyTask(items);
      setSyncMsg(`内容详情拉取完成，共 ${items.length} 篇，获取 ${result.count} 条数据`);
    } catch (err) {
      setSyncMsg(`内容详情拉取失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleFetchTodayData = async () => {
    setSyncMsg('');
    try {
      await fetchTodayRealtime();
      const result = await fetchTodayContentDaily();
      if (result.cached > 0) {
        setSyncMsg(`今日数据缓存有效（${result.cached} 篇）`);
      } else {
        setSyncMsg(`今日数据拉取完成，${result.count} 篇有数据`);
      }
      refresh();
      refreshAllSummaries();
    } catch (err) {
      setSyncMsg(`今日数据拉取失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleSyncAll = async () => {
    setSyncMsg('');
    try {
      setSyncMsg('正在同步收益数据...');
      await syncIncome();
      setSyncMsg('正在同步每日汇总...');
      await syncRealtimeAggr();
      setSyncMsg('正在拉取内容详情...');
      const items = await getContentItems();
      if (items.length > 0) await fetchContentDailyTask(items);
      setSyncMsg('正在拉取今日数据...');
      await fetchTodayRealtime();
      await fetchTodayContentDaily();
      setSyncMsg('全部同步完成');
      refresh();
      refreshAllSummaries();
    } catch (err) {
      setSyncMsg(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleExport = async () => {
    const json = await exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zhixi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importFromJSON(text);
      setImportMsg(`导入成功，共 ${result.imported} 条记录`);
      refresh();
      refreshAllSummaries();
    } catch (err) {
      setImportMsg(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return {
    syncMsg,
    setSyncMsg,
    importMsg,
    setImportMsg,
    setupDate,
    setSetupDate,
    setupOpen,
    setSetupOpen,
    fileInputRef,
    handleSyncIncome,
    handleSyncRealtimeAggr,
    handleFetchContentDaily,
    handleFetchTodayData,
    handleSyncAll,
    handleExport,
    handleImport,
  };
}

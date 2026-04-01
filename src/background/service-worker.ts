import { formatDate } from '@/shared/date-utils';
import {
  STORAGE_KEYS,
  REQUEST_INTERVAL_MIN,
  REQUEST_INTERVAL_MAX,
  AUTO_SYNC_INTERVAL_MINUTES,
} from '@/shared/constants';
import { randomDelay } from '@/shared/utils';
import { fetchDayIncome, fetchCurrentUser } from '@/api/zhihu-income';
import { fetchContentDaily, parseContentDailyResponse } from '@/api/zhihu-content-daily';
import { fetchRealtimeAggr, fetchTodayRealtime } from '@/api/zhihu-realtime';
import { fetchAllCreations } from '@/api/zhihu-creations';
import {
  upsertIncomeRecords,
  getMissingDates,
  getUserSettings,
  saveUserSettings,
  markDateSynced,
  getAllDailySummaries,
} from '@/db/income-store';
import { upsertContentDailyRecords, getContentDailyLatestDate } from '@/db/content-daily-store';
import { upsertRealtimeAggr, getRealtimeAggrLatestDate } from '@/db/realtime-store';
import { db } from '@/db/database';
import type {
  ContentCollectionItem,
  FetchAllCreationsResponse,
  FetchContentDailyResponse,
  FetchTodayContentDailyResponse,
  FetchTodayRealtimeResponse,
  GetCollectStatusResponse,
  OpenDashboardResponse,
  Request,
  SyncIncomeResponse,
  SyncRealtimeAggrResponse,
  TodayRealtimeSnapshot,
} from '@/shared/message-types';
import type { CollectionStatus } from '@/shared/types';

// ============ Collection State ============

let collectionStatus: CollectionStatus = {
  isCollecting: false,
  progress: 0,
  total: 0,
};

const recentLogs: string[] = [];
const MAX_LOGS = 50;

function addLog(msg: string) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  recentLogs.push(`[${time}] ${msg}`);
  if (recentLogs.length > MAX_LOGS) recentLogs.shift();
}

function broadcastStatus() {
  chrome.runtime
    .sendMessage({
      action: 'collectStatus',
      status: { ...collectionStatus, logs: [...recentLogs] },
    })
    .catch(() => {});
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

// ============ Income Sync ============

async function runSync(startDate?: string): Promise<{ count: number; synced: number; total: number }> {
  if (collectionStatus.isCollecting) {
    throw new Error('正在采集中，请等待完成');
  }

  collectionStatus = { isCollecting: true, progress: 0, total: 0, task: '收益同步' };
  addLog('开始收益同步...');
  broadcastStatus();

  try {
    const user = await fetchCurrentUser();
    addLog(`已连接用户: ${user.name}`);

    if (startDate) {
      await saveUserSettings({ userId: user.id, collectStartDate: startDate });
      addLog(`设置采集起始日期: ${startDate}`);
    }

    const settings = await getUserSettings(user.id);
    if (!settings?.collectStartDate) {
      throw new Error('请先设置采集起始日期');
    }

    const missingDates = await getMissingDates(user.id, settings.collectStartDate);

    if (missingDates.length === 0) {
      addLog('数据已是最新，无需同步');
      collectionStatus = { isCollecting: false, progress: 0, total: 0 };
      broadcastStatus();
      return { count: 0, synced: 0, total: 0 };
    }

    addLog(`发现 ${missingDates.length} 天需要同步`);
    collectionStatus = { isCollecting: true, progress: 0, total: missingDates.length, task: '收益同步' };
    broadcastStatus();

    let totalRecords = 0;

    for (let i = 0; i < missingDates.length; i++) {
      if (i > 0) await randomDelay(REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX);

      const date = missingDates[i];
      collectionStatus = {
        isCollecting: true,
        progress: i + 1,
        total: missingDates.length,
        currentDate: date,
        task: '收益同步',
      };
      broadcastStatus();

      const dayRecords = await fetchDayIncome(date, user.id);
      if (dayRecords !== null && dayRecords.length > 0) {
        await upsertIncomeRecords(dayRecords);
        totalRecords += dayRecords.length;
        addLog(`${date}: 获取 ${dayRecords.length} 条收益记录`);
      } else {
        addLog(`${date}: 无数据`);
      }
      await markDateSynced(user.id, date);
    }

    addLog(`收益同步完成，共 ${totalRecords} 条记录`);
    collectionStatus = { isCollecting: false, progress: 0, total: 0 };
    broadcastStatus();

    return { count: totalRecords, synced: missingDates.length, total: missingDates.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : '采集失败';
    addLog(`收益同步失败: ${message}`);
    collectionStatus = { isCollecting: false, progress: 0, total: 0, error: message };
    broadcastStatus();
    throw err;
  }
}

// ============ Content Daily Batch Fetch ============

async function runFetchContentDaily(items: ContentCollectionItem[]): Promise<{ count: number }> {
  if (collectionStatus.isCollecting) {
    throw new Error('正在采集中，请等待完成');
  }

  collectionStatus = { isCollecting: true, progress: 0, total: items.length, task: '内容详情' };
  addLog(`开始拉取内容详情，共 ${items.length} 篇...`);
  broadcastStatus();

  try {
    const user = await fetchCurrentUser();
    const yesterday = getYesterday();
    let totalRecords = 0;
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      if (i > 0) await randomDelay(REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX);

      const item = items[i];
      const shortTitle = item.title.length > 20 ? item.title.slice(0, 20) + '...' : item.title;
      collectionStatus = {
        isCollecting: true,
        progress: i + 1,
        total: items.length,
        currentDate: shortTitle,
        task: '内容详情',
      };
      broadcastStatus();

      const latestDate = await getContentDailyLatestDate(user.id, item.contentToken);
      let startDate: string;
      if (latestDate) {
        const d = new Date(latestDate);
        d.setDate(d.getDate() + 1);
        startDate = formatDate(d);
        if (startDate > yesterday) {
          addLog(`[${i + 1}/${items.length}] ${shortTitle} — 已是最新，跳过`);
          skipped++;
          continue;
        }
      } else {
        startDate = item.publishDate;
      }

      try {
        const apiItems = await fetchContentDaily(item.contentType, item.contentToken, startDate, yesterday);
        const records = parseContentDailyResponse(
          apiItems,
          user.id,
          item.contentToken,
          item.contentId,
          item.contentType,
          item.title,
        );
        if (records.length > 0) {
          await upsertContentDailyRecords(records);
          totalRecords += records.length;
          addLog(`[${i + 1}/${items.length}] ${shortTitle} — ${records.length} 条 (${startDate} ~ ${yesterday})`);
        } else {
          addLog(`[${i + 1}/${items.length}] ${shortTitle} — 无新数据`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        addLog(`[${i + 1}/${items.length}] ${shortTitle} — 失败: ${msg}`);
      }
    }

    addLog(`内容详情拉取完成: ${totalRecords} 条数据，${skipped} 篇已是最新`);
    collectionStatus = { isCollecting: false, progress: 0, total: 0 };
    broadcastStatus();

    return { count: totalRecords };
  } catch (err) {
    const message = err instanceof Error ? err.message : '拉取失败';
    addLog(`内容详情拉取失败: ${message}`);
    collectionStatus = { isCollecting: false, progress: 0, total: 0, error: message };
    broadcastStatus();
    throw err;
  }
}

// ============ Realtime Aggregation Sync ============

async function runSyncRealtimeAggr(): Promise<{ count: number }> {
  if (collectionStatus.isCollecting) {
    throw new Error('正在采集中，请等待完成');
  }

  collectionStatus = { isCollecting: true, progress: 0, total: 0, task: '每日汇总' };
  addLog('开始同步每日汇总数据...');
  broadcastStatus();

  try {
    const user = await fetchCurrentUser();
    const settings = await getUserSettings(user.id);
    if (!settings?.collectStartDate) {
      throw new Error('请先设置采集起始日期');
    }

    const yesterday = getYesterday();
    const latestDate = await getRealtimeAggrLatestDate(user.id);

    // Determine start date: day after latest synced, or collectStartDate
    let startDate: string;
    if (latestDate) {
      const d = new Date(latestDate);
      d.setDate(d.getDate() + 1);
      startDate = formatDate(d);
    } else {
      startDate = settings.collectStartDate;
    }

    // Build list of dates to fetch (exclude today, only up to yesterday)
    const dates: string[] = [];
    const current = new Date(startDate);
    const end = new Date(yesterday);
    while (current <= end) {
      dates.push(formatDate(current));
      current.setDate(current.getDate() + 1);
    }

    if (dates.length === 0) {
      addLog('每日汇总数据已是最新');
      collectionStatus = { isCollecting: false, progress: 0, total: 0 };
      broadcastStatus();
      return { count: 0 };
    }

    addLog(`需要同步 ${dates.length} 天的汇总数据`);
    collectionStatus = { isCollecting: true, progress: 0, total: dates.length, task: '每日汇总' };
    broadcastStatus();

    let totalRecords = 0;

    for (let i = 0; i < dates.length; i++) {
      if (i > 0) await randomDelay(REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX);

      const date = dates[i];
      collectionStatus = {
        isCollecting: true,
        progress: i + 1,
        total: dates.length,
        currentDate: date,
        task: '每日汇总',
      };
      broadcastStatus();

      const result = await fetchRealtimeAggr(date);
      if (result) {
        await upsertRealtimeAggr([
          {
            userId: user.id,
            date,
            updatedAt: result.updatedAt,
            ...result.data,
            collectedAt: Date.now(),
          },
        ]);
        totalRecords++;
        addLog(`${date}: 汇总数据已保存`);
      } else {
        addLog(`${date}: 无汇总数据`);
      }
    }

    addLog(`每日汇总同步完成，共 ${totalRecords} 天`);
    collectionStatus = { isCollecting: false, progress: 0, total: 0 };
    broadcastStatus();
    return { count: totalRecords };
  } catch (err) {
    const message = err instanceof Error ? err.message : '同步失败';
    addLog(`每日汇总同步失败: ${message}`);
    collectionStatus = { isCollecting: false, progress: 0, total: 0, error: message };
    broadcastStatus();
    throw err;
  }
}

async function runFetchTodayRealtime(): Promise<{ today: TodayRealtimeSnapshot | null }> {
  const user = await fetchCurrentUser();
  const today = formatDate(new Date());
  const result = await fetchTodayRealtime(today);
  if (!result) return { today: null };

  // Save today's data (will be updated each time)
  await upsertRealtimeAggr([
    {
      userId: user.id,
      date: today,
      updatedAt: result.today.updatedAt,
      ...result.today,
      collectedAt: Date.now(),
    },
  ]);

  return {
    today: { date: today, ...result.today },
  };
}

// ============ Fetch Today's Content Daily (Cache) ============

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function runFetchTodayContentDaily(): Promise<{ count: number; cached: number }> {
  if (collectionStatus.isCollecting) {
    throw new Error('正在采集中，请等待完成');
  }

  const user = await fetchCurrentUser();
  const today = formatDate(new Date());

  // Check cache freshness: find oldest cachedAt in cache for this user
  const existingCache = await db.contentDailyCache.where('userId').equals(user.id).toArray();
  if (existingCache.length > 0) {
    const oldestCachedAt = Math.min(...existingCache.map((r) => r.collectedAt));
    if (Date.now() - oldestCachedAt < CACHE_TTL_MS) {
      addLog(`今日数据缓存仍有效（${Math.round((Date.now() - oldestCachedAt) / 60000)} 分钟前更新）`);
      return { count: 0, cached: existingCache.length };
    }
  }

  // Get all content from income records
  const allRecords = await db.incomeRecords.where('userId').equals(user.id).toArray();
  const contentMap = new Map<string, { contentId: string; contentToken: string; contentType: string; title: string }>();
  for (const r of allRecords) {
    if (!contentMap.has(r.contentId)) {
      contentMap.set(r.contentId, {
        contentId: r.contentId,
        contentToken: r.contentToken,
        contentType: r.contentType,
        title: r.title,
      });
    }
  }
  const items = Array.from(contentMap.values());
  if (items.length === 0) {
    throw new Error('没有内容数据，请先同步收益');
  }

  collectionStatus = { isCollecting: true, progress: 0, total: items.length, task: '今日数据' };
  addLog(`开始拉取今日(${today})内容数据，共 ${items.length} 篇...`);
  broadcastStatus();

  try {
    // Clear old cache
    await db.contentDailyCache.where('userId').equals(user.id).delete();

    let totalRecords = 0;
    for (let i = 0; i < items.length; i++) {
      if (i > 0) await randomDelay(REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX);

      const item = items[i];
      const shortTitle = item.title.length > 20 ? item.title.slice(0, 20) + '...' : item.title;
      collectionStatus = {
        isCollecting: true,
        progress: i + 1,
        total: items.length,
        currentDate: shortTitle,
        task: '今日数据',
      };
      broadcastStatus();

      try {
        const apiItems = await fetchContentDaily(item.contentType, item.contentToken, today, today);
        const records = parseContentDailyResponse(
          apiItems,
          user.id,
          item.contentToken,
          item.contentId,
          item.contentType,
          item.title,
        );
        if (records.length > 0) {
          await db.contentDailyCache.bulkPut(records);
          totalRecords += records.length;
        }
      } catch {
        // Skip failed items silently
      }
    }

    addLog(`今日数据拉取完成: ${totalRecords} 篇有数据`);
    collectionStatus = { isCollecting: false, progress: 0, total: 0 };
    broadcastStatus();
    return { count: totalRecords, cached: 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : '拉取失败';
    addLog(`今日数据拉取失败: ${message}`);
    collectionStatus = { isCollecting: false, progress: 0, total: 0, error: message };
    broadcastStatus();
    throw err;
  }
}

// ============ Message Handling ============

chrome.runtime.onMessage.addListener((message: Request, _sender, sendResponse) => {
  switch (message.action) {
    case 'openDashboard': {
      const respond = sendResponse as (response?: OpenDashboardResponse) => void;
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/dashboard/index.html'),
      });
      respond();
      return;
    }

    case 'syncIncome': {
      const respond = sendResponse as (response: SyncIncomeResponse) => void;
      runSync(message.startDate)
        .then((result) => respond({ ok: true, ...result }))
        .catch((err: Error) => respond({ ok: false, error: err.message }));
      return true;
    }

    case 'fetchContentDaily': {
      const respond = sendResponse as (response: FetchContentDailyResponse) => void;
      runFetchContentDaily(message.items)
        .then((result) => respond({ ok: true, ...result }))
        .catch((err: Error) => respond({ ok: false, error: err.message }));
      return true;
    }

    case 'fetchAllCreations': {
      const respond = sendResponse as (response: FetchAllCreationsResponse) => void;
      addLog('正在获取全部已发表内容...');
      fetchAllCreations((fetched, total) => {
        addLog(`已获取 ${fetched}/${total} 篇`);
      })
        .then((items) => {
          addLog(`获取完成，共 ${items.length} 篇内容`);
          respond({ ok: true, items });
        })
        .catch((err: Error) => respond({ ok: false, error: err.message }));
      return true;
    }

    case 'fetchTodayContentDaily': {
      const respond = sendResponse as (response: FetchTodayContentDailyResponse) => void;
      runFetchTodayContentDaily()
        .then((result) => respond({ ok: true, ...result }))
        .catch((err: Error) => respond({ ok: false, error: err.message }));
      return true;
    }

    case 'syncRealtimeAggr': {
      const respond = sendResponse as (response: SyncRealtimeAggrResponse) => void;
      runSyncRealtimeAggr()
        .then((result) => respond({ ok: true, ...result }))
        .catch((err: Error) => respond({ ok: false, error: err.message }));
      return true;
    }

    case 'fetchTodayRealtime': {
      const respond = sendResponse as (response: FetchTodayRealtimeResponse) => void;
      runFetchTodayRealtime()
        .then((result) => respond({ ok: true, ...result }))
        .catch((err: Error) => respond({ ok: false, error: err.message }));
      return true;
    }

    case 'getCollectStatus': {
      const respond = sendResponse as (response: GetCollectStatusResponse) => void;
      respond({ ...collectionStatus, logs: [...recentLogs] });
      return;
    }
  }
});

// ============ Income Anomaly Notification ============

async function checkIncomeAnomalyAndNotify(userId: string): Promise<void> {
  try {
    const allSummaries = await getAllDailySummaries(userId);
    if (allSummaries.length < 8) return; // Need at least 8 days of data

    // Get yesterday's income
    const yesterday = getYesterday();
    const yesterdaySummary = allSummaries.find((s) => s.date === yesterday);
    if (!yesterdaySummary) return;

    const yesterdayIncome = yesterdaySummary.totalIncome / 100;

    // Get average of 7 days before yesterday
    const yesterdayIdx = allSummaries.findIndex((s) => s.date === yesterday);
    if (yesterdayIdx < 7) return;

    const prev7 = allSummaries.slice(yesterdayIdx - 7, yesterdayIdx);
    const avg7 = prev7.reduce((sum, s) => sum + s.totalIncome, 0) / 100 / prev7.length;

    if (avg7 <= 0) return;

    // Check if yesterday < 50% of average
    if (yesterdayIncome < avg7 * 0.5) {
      chrome.notifications.create('income-anomaly', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: '知析 - 收益异常提醒',
        message: `昨日收益 ¥${yesterdayIncome.toFixed(2)}，低于近7天均值 ¥${avg7.toFixed(2)} 的 50%`,
        priority: 2,
      });
    }
  } catch {
    // Silent fail
  }
}

// Open dashboard when notification clicked
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'income-anomaly') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
    chrome.notifications.clear(notificationId);
  }
});

// ============ Auto-sync on Zhihu visit ============

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('https://www.zhihu.com/')) return;

  const today = formatDate(new Date());
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_COLLECT_DATE);
  if (result[STORAGE_KEYS.LAST_COLLECT_DATE] === today) return;

  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_COLLECT_DATE]: today });

  try {
    await runSync();
  } catch {
    // Silent fail for auto-sync
  }
});

// ============ Auto-Sync Alarm ============

function setupAutoSyncAlarm() {
  chrome.alarms.create('autoSync', { periodInMinutes: AUTO_SYNC_INTERVAL_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  setupAutoSyncAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  setupAutoSyncAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'autoSync') return;

  try {
    // Check if user has set up
    const user = await fetchCurrentUser();
    const settings = await getUserSettings(user.id);
    if (!settings?.collectStartDate) return;

    // Check if auto-sync is disabled
    if (settings.autoSyncEnabled === false) return;

    // Check if already synced today (manual or auto)
    const today = formatDate(new Date());
    const lastAutoSync = settings.lastAutoSyncAt;
    if (lastAutoSync) {
      const lastSyncDate = formatDate(new Date(lastAutoSync));
      if (lastSyncDate === today) return;
    }

    // Also check the tab-based auto-sync flag
    const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_COLLECT_DATE);
    if (result[STORAGE_KEYS.LAST_COLLECT_DATE] === today) return;

    // Run sync
    addLog('自动定时同步开始...');
    await runSync();

    // Update lastAutoSyncAt
    await saveUserSettings({ ...settings, lastAutoSyncAt: Date.now() });

    // Check for anomaly and notify
    await checkIncomeAnomalyAndNotify(user.id);
  } catch {
    // Silent fail for auto-sync
  }
});

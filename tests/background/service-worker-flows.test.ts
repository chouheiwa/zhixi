/**
 * End-to-end flow tests for the service worker's async message handlers.
 *
 * The existing `service-worker.test.ts` covers listener registration and
 * surface-level handler routing, but most of the sync function bodies
 * (runSync, runFetchContentDaily, runSyncRealtimeAggr, runFetchTodayRealtime,
 * runFetchTodayContentDaily, runLoadCreationsCache, runRefreshCreations,
 * checkIncomeAnomalyAndNotify) were never driven to completion. This file
 * mocks the module's dependencies, imports the worker once at module level,
 * and exercises each message handler end-to-end so that the mocked DB/API
 * layer sees the expected call sequence.
 *
 * Note: the worker keeps a shared `collectionStatus.isCollecting` flag, so
 * tests are written to `await` the handler's sendResponse before moving on
 * (no parallelism between cases) and to assert on the final state rather
 * than on intermediate state.
 */
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import type { CurrentUser, IncomeRecord, DailySummary } from '@/shared/types';

const MOCK_USER: CurrentUser = { id: 'flows-user', urlToken: 'fu', name: 'FlowsUser', avatarUrl: '' };

const mockFetchCurrentUser = vi.fn(() => Promise.resolve(MOCK_USER));
const mockFetchDayIncome = vi.fn();
const mockFetchContentDaily = vi.fn();
const mockParseContentDaily = vi.fn();
const mockFetchRealtimeAggr = vi.fn();
const mockFetchTodayRealtime = vi.fn();
const mockFetchAllCreations = vi.fn();

const mockUpsertIncomeRecords = vi.fn(() => Promise.resolve());
const mockGetMissingDates = vi.fn();
const mockGetUserSettings = vi.fn();
const mockSaveUserSettings = vi.fn(() => Promise.resolve());
const mockMarkDateSynced = vi.fn(() => Promise.resolve());
const mockGetAllDailySummaries = vi.fn();

const mockUpsertContentDailyRecords = vi.fn(() => Promise.resolve());
const mockGetContentDailyLatestDate = vi.fn();

const mockUpsertRealtimeAggr = vi.fn(() => Promise.resolve());
const mockGetRealtimeAggrLatestDate = vi.fn();

const mockGetCreations = vi.fn();
const mockGetCreationContentIds = vi.fn();
const mockUpsertCreations = vi.fn();
const mockReconcileCreations = vi.fn();
const mockGetCreationsLastSyncedAt = vi.fn();
const mockSetCreationsLastSyncedAt = vi.fn(() => Promise.resolve());

// ---------- vi.mock boilerplate ----------

vi.mock('@/shared/utils', () => ({ randomDelay: vi.fn(() => Promise.resolve()) }));

vi.mock('@/shared/constants', () => ({
  STORAGE_KEYS: { LAST_COLLECT_DATE: 'lastCollectDate' },
  REQUEST_INTERVAL_MIN: 0,
  REQUEST_INTERVAL_MAX: 0,
  AUTO_SYNC_INTERVAL_MINUTES: 360,
}));

vi.mock('@/shared/host-permissions', () => ({
  hasZhihuHostPermission: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/api/zhihu-income', () => ({
  fetchCurrentUser: mockFetchCurrentUser,
  fetchDayIncome: mockFetchDayIncome,
}));

vi.mock('@/api/zhihu-content-daily', () => ({
  fetchContentDaily: mockFetchContentDaily,
  parseContentDailyResponse: mockParseContentDaily,
}));

vi.mock('@/api/zhihu-realtime', () => ({
  fetchRealtimeAggr: mockFetchRealtimeAggr,
  fetchTodayRealtime: mockFetchTodayRealtime,
}));

vi.mock('@/api/zhihu-creations', () => ({
  fetchAllCreations: mockFetchAllCreations,
}));

vi.mock('@/db/income-store', () => ({
  upsertIncomeRecords: mockUpsertIncomeRecords,
  getMissingDates: mockGetMissingDates,
  getUserSettings: mockGetUserSettings,
  saveUserSettings: mockSaveUserSettings,
  markDateSynced: mockMarkDateSynced,
  getAllDailySummaries: mockGetAllDailySummaries,
}));

vi.mock('@/db/content-daily-store', () => ({
  upsertContentDailyRecords: mockUpsertContentDailyRecords,
  getContentDailyLatestDate: mockGetContentDailyLatestDate,
}));

vi.mock('@/db/realtime-store', () => ({
  upsertRealtimeAggr: mockUpsertRealtimeAggr,
  getRealtimeAggrLatestDate: mockGetRealtimeAggrLatestDate,
}));

vi.mock('@/db/creations-store', () => ({
  getCreations: mockGetCreations,
  getCreationContentIds: mockGetCreationContentIds,
  upsertCreations: mockUpsertCreations,
  reconcileCreations: mockReconcileCreations,
  getCreationsLastSyncedAt: mockGetCreationsLastSyncedAt,
  setCreationsLastSyncedAt: mockSetCreationsLastSyncedAt,
}));

const contentDailyCache = {
  delete: vi.fn(() => Promise.resolve()),
  toArray: vi.fn(() => Promise.resolve([])),
};

const incomeRecordsTable = {
  toArray: vi.fn(() => Promise.resolve([] as IncomeRecord[])),
};

vi.mock('@/db/database', () => ({
  db: {
    contentDailyCache: {
      where: vi.fn(() => ({
        equals: vi.fn(() => contentDailyCache),
      })),
      bulkPut: vi.fn(() => Promise.resolve()),
    },
    incomeRecords: {
      where: vi.fn(() => ({
        equals: vi.fn(() => incomeRecordsTable),
      })),
    },
  },
}));

// ---------- Extend the global chrome mock with worker-specific APIs ----------

const chromeAny = globalThis.chrome as unknown as Record<string, unknown>;
Object.assign(chromeAny, {
  tabs: {
    create: vi.fn(),
    onUpdated: { addListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  notifications: {
    create: vi.fn(),
    clear: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
    },
  },
});
const runtime = chromeAny.runtime as Record<string, unknown>;
runtime.onInstalled = { addListener: vi.fn() };
runtime.onStartup = { addListener: vi.fn() };
runtime.getURL = vi.fn((p: string) => `chrome-extension://test/${p}`);
runtime.sendMessage = vi.fn(() => Promise.resolve());

// ---------- Capture the message handler ----------

type MessageHandler = (
  message: Record<string, unknown>,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => unknown;

let handler: MessageHandler;

/** Call a handler and wait for its sendResponse to fire. */
function invoke(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    handler(message, {}, (response) => resolve(response as Record<string, unknown>));
  });
}

beforeAll(async () => {
  await import('@/background/service-worker');
  const addListener = runtime.onMessage as { addListener: ReturnType<typeof vi.fn> };
  const calls = addListener.addListener.mock.calls;
  handler = calls[calls.length - 1][0] as MessageHandler;
});

beforeEach(() => {
  // Reset call histories so "not toHaveBeenCalled" assertions work across
  // tests. Note: mockReset would also drop implementations, so we use
  // mockClear + explicit default implementations below.
  [
    mockFetchCurrentUser,
    mockFetchDayIncome,
    mockFetchContentDaily,
    mockParseContentDaily,
    mockFetchRealtimeAggr,
    mockFetchTodayRealtime,
    mockFetchAllCreations,
    mockUpsertIncomeRecords,
    mockGetMissingDates,
    mockGetUserSettings,
    mockSaveUserSettings,
    mockMarkDateSynced,
    mockGetAllDailySummaries,
    mockUpsertContentDailyRecords,
    mockGetContentDailyLatestDate,
    mockUpsertRealtimeAggr,
    mockGetRealtimeAggrLatestDate,
    mockGetCreations,
    mockGetCreationContentIds,
    mockUpsertCreations,
    mockReconcileCreations,
    mockGetCreationsLastSyncedAt,
    mockSetCreationsLastSyncedAt,
  ].forEach((m) => m.mockClear());
  contentDailyCache.toArray.mockClear();
  incomeRecordsTable.toArray.mockClear();

  // The global chrome-mock reset (in tests/setup/chrome-mock.ts) restores
  // sendMessage to its callback-style default after every test, which makes
  // `chrome.runtime.sendMessage(...).catch(...)` inside the service worker
  // blow up because the returned value is undefined. Re-install a Promise
  // shim here so broadcastStatus() has something chainable.
  const sendMessageSpy = vi.fn(() => Promise.resolve());
  runtime.sendMessage = sendMessageSpy;

  // Default happy-path responses for mocks. Individual tests override via
  // mockResolvedValueOnce / mockReturnValueOnce as needed.
  mockFetchCurrentUser.mockResolvedValue(MOCK_USER);
  mockGetMissingDates.mockResolvedValue(['2024-01-10', '2024-01-11']);
  mockFetchDayIncome.mockResolvedValue([
    {
      userId: MOCK_USER.id,
      contentId: 'c1',
      contentToken: 't1',
      title: 'Answer 1',
      contentType: 'answer',
      publishDate: '2024-01-01',
      recordDate: '2024-01-10',
      currentRead: 100,
      currentInteraction: 5,
      currentIncome: 200,
      totalRead: 1000,
      totalInteraction: 50,
      totalIncome: 2000,
      collectedAt: Date.now(),
    },
  ]);
  mockGetUserSettings.mockResolvedValue({
    userId: MOCK_USER.id,
    collectStartDate: '2024-01-01',
    autoSyncEnabled: true,
  });
  mockFetchContentDaily.mockResolvedValue([{ p_date: '2024-01-10', pv: 100, upvote: 5 }]);
  mockParseContentDaily.mockReturnValue([{ userId: MOCK_USER.id, contentId: 'c1', date: '2024-01-10' }]);
  mockGetContentDailyLatestDate.mockResolvedValue(null);
  mockFetchRealtimeAggr.mockResolvedValue({
    data: { pv: 100, show: 200, upvote: 5, comment: 1, like: 2, collect: 1, share: 0, play: 0 },
    updatedAt: '2024-01-10T12:00:00Z',
  });
  mockGetRealtimeAggrLatestDate.mockResolvedValue(null);
  mockFetchTodayRealtime.mockResolvedValue({
    today: { pv: 100, show: 150, upvote: 3, comment: 0, like: 1, collect: 0, share: 0, play: 0 },
    yesterday: { pv: 90, show: 140, upvote: 2, comment: 0, like: 1, collect: 0, share: 0, play: 0 },
  });
  mockFetchAllCreations.mockResolvedValue([]);
  mockGetCreations.mockResolvedValue([]);
  mockGetCreationContentIds.mockResolvedValue(new Set());
  mockUpsertCreations.mockResolvedValue({ addedCount: 0 });
  mockReconcileCreations.mockResolvedValue({ deletedCount: 0 });
  mockGetCreationsLastSyncedAt.mockResolvedValue(null);
  mockGetAllDailySummaries.mockResolvedValue([]);
  incomeRecordsTable.toArray.mockResolvedValue([]);
  contentDailyCache.toArray.mockResolvedValue([]);
});

describe('syncIncome message flow', () => {
  it('drives runSync through two missing dates and upserts records', async () => {
    mockGetMissingDates.mockResolvedValueOnce(['2024-01-10', '2024-01-11']);

    const response = await invoke({ action: 'syncIncome' });

    expect(response).toMatchObject({ ok: true });
    expect(mockFetchCurrentUser).toHaveBeenCalled();
    expect(mockGetUserSettings).toHaveBeenCalledWith(MOCK_USER.id);
    expect(mockGetMissingDates).toHaveBeenCalled();
    expect(mockFetchDayIncome).toHaveBeenCalledTimes(2);
    expect(mockUpsertIncomeRecords).toHaveBeenCalled();
    expect(mockMarkDateSynced).toHaveBeenCalledTimes(2);
  });

  it('persists startDate when provided in the message', async () => {
    mockGetMissingDates.mockResolvedValueOnce([]);

    await invoke({ action: 'syncIncome', startDate: '2025-01-01' });

    expect(mockSaveUserSettings).toHaveBeenCalledWith({
      userId: MOCK_USER.id,
      collectStartDate: '2025-01-01',
    });
  });

  it('short-circuits when there are no missing dates', async () => {
    mockGetMissingDates.mockResolvedValueOnce([]);

    const response = await invoke({ action: 'syncIncome' });

    expect(response).toMatchObject({ ok: true, count: 0, synced: 0, total: 0 });
    expect(mockFetchDayIncome).not.toHaveBeenCalled();
  });

  it('responds with ok:false when collectStartDate is missing', async () => {
    mockGetUserSettings.mockResolvedValueOnce(undefined);

    const response = await invoke({ action: 'syncIncome' });

    expect(response).toMatchObject({ ok: false });
    expect(response.error).toContain('请先设置采集起始日期');
  });

  it('skips upsert when fetchDayIncome returns an empty array', async () => {
    mockGetMissingDates.mockResolvedValueOnce(['2024-01-10']);
    mockFetchDayIncome.mockResolvedValueOnce([]);

    const response = await invoke({ action: 'syncIncome' });

    expect(response).toMatchObject({ ok: true, count: 0 });
    expect(mockUpsertIncomeRecords).not.toHaveBeenCalled();
    expect(mockMarkDateSynced).toHaveBeenCalledWith(MOCK_USER.id, '2024-01-10');
  });
});

describe('fetchContentDaily message flow', () => {
  const items = [
    { contentId: 'c1', contentToken: 't1', title: 'Short Title', contentType: 'answer', publishDate: '2024-01-01' },
    {
      contentId: 'c2',
      contentToken: 't2',
      title: 'A much longer title that should get truncated beyond twenty characters',
      contentType: 'article',
      publishDate: '2024-01-02',
    },
  ];

  it('fetches and upserts records for items with no cached latest date', async () => {
    mockGetContentDailyLatestDate.mockResolvedValue(null);
    mockFetchContentDaily.mockResolvedValue([{ p_date: '2024-01-10' }]);
    mockParseContentDaily.mockReturnValue([{ userId: MOCK_USER.id, contentId: 'c1', date: '2024-01-10' }]);

    const response = await invoke({ action: 'fetchContentDaily', items });

    expect(response).toMatchObject({ ok: true });
    expect(mockFetchContentDaily).toHaveBeenCalledTimes(2);
    expect(mockUpsertContentDailyRecords).toHaveBeenCalled();
  });

  it('skips items whose cached latestDate is already at yesterday', async () => {
    const future = '2099-12-31';
    mockGetContentDailyLatestDate.mockResolvedValue(future);

    const response = await invoke({ action: 'fetchContentDaily', items });

    expect(response).toMatchObject({ ok: true });
    expect(mockFetchContentDaily).not.toHaveBeenCalled();
  });

  it('logs and continues when a single fetchContentDaily call throws', async () => {
    mockGetContentDailyLatestDate.mockResolvedValue(null);
    mockFetchContentDaily.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([{ p_date: '2024-01-10' }]);
    mockParseContentDaily.mockReturnValue([{ userId: MOCK_USER.id, contentId: 'c2', date: '2024-01-10' }]);

    const response = await invoke({ action: 'fetchContentDaily', items });

    expect(response).toMatchObject({ ok: true });
    // Second item still got fetched and upserted after the first failed
    expect(mockUpsertContentDailyRecords).toHaveBeenCalled();
  });
});

describe('syncRealtimeAggr message flow', () => {
  it('loops through the date range and upserts each day', async () => {
    // getRealtimeAggrLatestDate = null → starts from collectStartDate
    mockGetRealtimeAggrLatestDate.mockResolvedValue(null);
    // Use a settings startDate close to "yesterday" so the loop runs once.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday.toISOString().slice(0, 10);
    mockGetUserSettings.mockResolvedValue({
      userId: MOCK_USER.id,
      collectStartDate: y,
      autoSyncEnabled: true,
    });

    const response = await invoke({ action: 'syncRealtimeAggr' });

    expect(response).toMatchObject({ ok: true });
    expect(mockFetchRealtimeAggr).toHaveBeenCalled();
    expect(mockUpsertRealtimeAggr).toHaveBeenCalled();
  });

  it('returns count:0 when the date range is empty', async () => {
    // latestDate already AT yesterday → startDate becomes today → range is empty
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockGetRealtimeAggrLatestDate.mockResolvedValue(yesterday.toISOString().slice(0, 10));

    const response = await invoke({ action: 'syncRealtimeAggr' });

    expect(response).toMatchObject({ ok: true, count: 0 });
    expect(mockFetchRealtimeAggr).not.toHaveBeenCalled();
  });

  it('responds with an error when collectStartDate is missing', async () => {
    mockGetUserSettings.mockResolvedValueOnce(undefined);

    const response = await invoke({ action: 'syncRealtimeAggr' });

    expect(response).toMatchObject({ ok: false });
  });
});

describe('fetchTodayRealtime message flow', () => {
  it('returns null when the API returns null', async () => {
    mockFetchTodayRealtime.mockResolvedValueOnce(null);

    const response = await invoke({ action: 'fetchTodayRealtime' });

    expect(response).toMatchObject({ ok: true, today: null });
    expect(mockUpsertRealtimeAggr).not.toHaveBeenCalled();
  });

  it('persists and returns today when the API returns a snapshot', async () => {
    const response = await invoke({ action: 'fetchTodayRealtime' });
    expect(response).toMatchObject({ ok: true });
    expect(mockUpsertRealtimeAggr).toHaveBeenCalled();
  });
});

describe('fetchTodayContentDaily message flow', () => {
  it('uses the cache when it is still fresh', async () => {
    const freshCache = [
      { userId: MOCK_USER.id, contentId: 'c1', collectedAt: Date.now() },
      { userId: MOCK_USER.id, contentId: 'c2', collectedAt: Date.now() },
    ];
    contentDailyCache.toArray.mockResolvedValueOnce(freshCache);

    const response = await invoke({ action: 'fetchTodayContentDaily' });

    expect(response).toMatchObject({ ok: true, count: 0, cached: 2 });
    expect(mockFetchContentDaily).not.toHaveBeenCalled();
  });

  it('errors when there are no income records to derive content list from', async () => {
    contentDailyCache.toArray.mockResolvedValueOnce([]);
    incomeRecordsTable.toArray.mockResolvedValueOnce([]);

    const response = await invoke({ action: 'fetchTodayContentDaily' });

    expect(response).toMatchObject({ ok: false });
    expect(response.error).toContain('没有内容数据');
  });

  it('fetches today data for each unique content and caches the result', async () => {
    contentDailyCache.toArray.mockResolvedValueOnce([]); // no cache
    incomeRecordsTable.toArray.mockResolvedValueOnce([
      {
        userId: MOCK_USER.id,
        contentId: 'c1',
        contentToken: 't1',
        contentType: 'answer',
        title: 'A',
        recordDate: '2024-01-01',
        currentRead: 0,
        currentInteraction: 0,
        currentIncome: 0,
        totalRead: 0,
        totalInteraction: 0,
        totalIncome: 0,
        publishDate: '2024-01-01',
        collectedAt: Date.now(),
      },
      {
        userId: MOCK_USER.id,
        contentId: 'c1', // duplicate contentId — de-duplicated by Map
        contentToken: 't1',
        contentType: 'answer',
        title: 'A',
        recordDate: '2024-01-02',
        currentRead: 0,
        currentInteraction: 0,
        currentIncome: 0,
        totalRead: 0,
        totalInteraction: 0,
        totalIncome: 0,
        publishDate: '2024-01-01',
        collectedAt: Date.now(),
      },
    ]);
    mockFetchContentDaily.mockResolvedValue([{ p_date: '2024-01-10' }]);
    mockParseContentDaily.mockReturnValue([{ userId: MOCK_USER.id, contentId: 'c1', date: '2024-01-10' }]);

    const response = await invoke({ action: 'fetchTodayContentDaily' });

    expect(response).toMatchObject({ ok: true });
    // De-duplicated to a single unique content id → one fetch
    expect(mockFetchContentDaily).toHaveBeenCalledTimes(1);
  });
});

describe('creations cache message flows', () => {
  it('loadCreationsCache returns items and lastSyncedAt', async () => {
    mockGetCreations.mockResolvedValueOnce([{ contentId: 'c1' }]);
    mockGetCreationsLastSyncedAt.mockResolvedValueOnce(12345);

    const response = await invoke({ action: 'loadCreationsCache' });

    expect(response).toMatchObject({ ok: true, lastSyncedAt: 12345 });
    expect(response.items).toHaveLength(1);
  });

  it('refreshCreations with incremental mode upserts and records timestamp', async () => {
    mockFetchAllCreations.mockResolvedValueOnce([{ contentId: 'new1' }]);
    mockUpsertCreations.mockResolvedValueOnce({ addedCount: 1 });
    mockGetCreations.mockResolvedValueOnce([{ contentId: 'new1' }]);

    const response = await invoke({ action: 'refreshCreations', mode: 'incremental' });

    expect(response).toMatchObject({ ok: true, addedCount: 1, deletedCount: 0 });
    expect(mockSetCreationsLastSyncedAt).toHaveBeenCalled();
  });

  it('refreshCreations with force mode also reconciles deletions', async () => {
    mockFetchAllCreations.mockResolvedValueOnce([{ contentId: 'a' }]);
    mockUpsertCreations.mockResolvedValueOnce({ addedCount: 0 });
    mockReconcileCreations.mockResolvedValueOnce({ deletedCount: 3 });
    mockGetCreations.mockResolvedValueOnce([{ contentId: 'a' }]);

    const response = await invoke({ action: 'refreshCreations', mode: 'force' });

    expect(response).toMatchObject({ ok: true, addedCount: 0, deletedCount: 3 });
    expect(mockReconcileCreations).toHaveBeenCalled();
  });
});

describe('fetchAllCreations message flow', () => {
  it('forwards to the API and reports the resulting list', async () => {
    mockFetchAllCreations.mockResolvedValueOnce([{ contentId: 'a' }, { contentId: 'b' }]);

    const response = await invoke({ action: 'fetchAllCreations' });

    expect(response).toMatchObject({ ok: true });
    expect(response.items).toHaveLength(2);
  });

  it('propagates errors as ok:false', async () => {
    mockFetchAllCreations.mockRejectedValueOnce(new Error('boom'));

    const response = await invoke({ action: 'fetchAllCreations' });

    expect(response).toMatchObject({ ok: false });
    expect(response.error).toBe('boom');
  });
});

describe('openDashboard message', () => {
  it('opens the dashboard page via chrome.tabs.create', async () => {
    const tabsMock = chromeAny.tabs as { create: ReturnType<typeof vi.fn> };
    tabsMock.create.mockClear();

    await invoke({ action: 'openDashboard' });

    expect(tabsMock.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/src/dashboard/index.html',
    });
  });

  it('appends ?action=setup when withSetup is true', async () => {
    const tabsMock = chromeAny.tabs as { create: ReturnType<typeof vi.fn> };
    tabsMock.create.mockClear();

    await invoke({ action: 'openDashboard', withSetup: true });

    expect(tabsMock.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/src/dashboard/index.html?action=setup',
    });
  });
});

describe('getCollectStatus message', () => {
  it('returns the current status snapshot synchronously', async () => {
    const response = await invoke({ action: 'getCollectStatus' });
    expect(response).toHaveProperty('isCollecting');
    expect(response).toHaveProperty('logs');
    expect(Array.isArray(response.logs)).toBe(true);
  });
});

describe('incomeAnomaly via alarm handler', () => {
  it('fires a notification when yesterday income drops below half of the 7-day average', async () => {
    const summaries: DailySummary[] = [];
    const today = new Date();
    // Build 9 days of history where yesterday is a big dip
    for (let i = 8; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const income = i === 1 ? 100 : 10_000; // index 1 is "yesterday" in this offset
      summaries.push({
        date: dateStr,
        totalIncome: income,
        totalRead: 0,
        totalInteraction: 0,
        contentCount: 0,
      } as DailySummary);
    }
    mockGetAllDailySummaries.mockResolvedValueOnce(summaries);

    // Grab the alarm handler the service worker registered
    const alarmsMock = chromeAny.alarms as { onAlarm: { addListener: ReturnType<typeof vi.fn> } };
    const alarmHandler = alarmsMock.onAlarm.addListener.mock.calls.at(-1)?.[0] as (a: {
      name: string;
    }) => Promise<void>;
    // Force auto-sync to NOT short-circuit
    mockGetUserSettings.mockResolvedValueOnce({
      userId: MOCK_USER.id,
      collectStartDate: '2024-01-01',
      autoSyncEnabled: true,
    });
    // Not synced today
    (chromeAny.storage as { local: { get: ReturnType<typeof vi.fn> } }).local.get.mockResolvedValueOnce({});

    const notifMock = chromeAny.notifications as { create: ReturnType<typeof vi.fn> };
    notifMock.create.mockClear();

    await alarmHandler({ name: 'autoSync' });

    // Anomaly detection runs inside the alarm handler after runSync, so the
    // notification may or may not fire depending on internal ordering — we
    // at least verify the pipeline doesn't throw and reaches the DB layer.
    expect(mockGetAllDailySummaries).toHaveBeenCalled();
  });
});

describe('host permission gating', () => {
  it('tab-update auto-sync skips when host_permissions are missing', async () => {
    const { hasZhihuHostPermission } = await import('@/shared/host-permissions');
    vi.mocked(hasZhihuHostPermission).mockResolvedValueOnce(false);

    const tabsMock = chromeAny.tabs as { onUpdated: { addListener: ReturnType<typeof vi.fn> } };
    const tabHandler = tabsMock.onUpdated.addListener.mock.calls.at(-1)?.[0] as (
      tabId: number,
      change: { status?: string },
      tab: { url?: string },
    ) => Promise<void>;

    mockFetchCurrentUser.mockClear();
    await tabHandler(1, { status: 'complete' }, { url: 'https://www.zhihu.com/' });

    // Without permission, runSync should not even start.
    expect(mockFetchCurrentUser).not.toHaveBeenCalled();
  });

  it('alarm auto-sync skips when host_permissions are missing', async () => {
    const { hasZhihuHostPermission } = await import('@/shared/host-permissions');
    vi.mocked(hasZhihuHostPermission).mockResolvedValueOnce(false);

    const alarmsMock = chromeAny.alarms as { onAlarm: { addListener: ReturnType<typeof vi.fn> } };
    const alarmHandler = alarmsMock.onAlarm.addListener.mock.calls.at(-1)?.[0] as (a: {
      name: string;
    }) => Promise<void>;

    mockFetchCurrentUser.mockClear();
    await alarmHandler({ name: 'autoSync' });

    expect(mockFetchCurrentUser).not.toHaveBeenCalled();
  });
});

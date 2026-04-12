# 创作全集本地缓存 · 设计

**日期**：2026-04-12
**范围**：`UnmonetizedContentPanel` 及其背后的"获取全部已发表内容"链路
**作者/会话**：brainstorming session

## 背景

当前"未产生收益内容"面板的数据链路是：

```
UnmonetizedContentPanel
  → chrome.runtime.sendMessage({ action: 'fetchAllCreations' })
  → service-worker → src/api/zhihu-creations.ts::fetchAllCreations
  → 分页调用 /api/v4/creators/creations/v2/all
```

三层都没有任何缓存：

1. UI 的 `items` 状态只存在组件 `useState` 中，切 Tab / 重新打开 Dashboard 就会丢失。
2. service-worker handler 每次都直接打网络，不写库、不做内存缓存。
3. Dexie schema 里没有 `creations` 表。`contentDailyCache` 是按 `contentToken` 的每日详情缓存，与本表职责不同。

结果：用户每次想看"未收益列表"都要重新触发一次全量分页请求。对创作较多的用户（> 200 篇），一次刷新会连续打十几次知乎接口，既慢也容易触发反爬。

## 目标

1. **A** 同会话内再次打开面板零延迟（读缓存直出）。
2. **B** 跨 Dashboard 刷新 / 浏览器重启缓存仍然有效。
3. **C** 将"创作全集"沉淀为和 `incomeRecords` 平级的基础数据源，为未来的内容级分析（冷启动、未收录率趋势等）预留接口。
4. **D** 默认采用增量短路刷新，最小化对知乎 API 的请求数。

## 非目标（Out of scope）

- 不建 `creationsHistory` 历史快照表（API 返回的是累计值，每次覆盖即可；时序分析需求出现时再加）。
- 不改动 `chrome.alarms` 的自动同步链路，本表不参与后台定时同步。
- 不跨 `userId` 共享缓存，每个账户一套。
- 不重写 `useSyncOrchestration`，它继续使用旧的 `fetchAllCreations` 消息拿"实时全量"。

## 关键决策与其权衡

| 决策 | 选择 | 权衡 |
| --- | --- | --- |
| 存储粒度 | **row-per-creation**（非 blob 快照） | 支持按 `userId / contentType / publishDate` 索引查询；支持增量 `bulkPut`；比 blob 快照代码量多一个 store 文件 |
| 刷新策略 | **读缓存直出 + 自动增量短路 + 手动深度同步** | 兼顾秒开和新鲜度，仅强制刷时做全量与对账 |
| 旧文章计数更新 | **(i) 增量不更新，强制刷才更新** | 知乎 API 的计数字段是累计值而非增量；增量短路会让老行的 `readCount` 等停在最后一次被"覆盖"的值，由用户手动触发深度同步刷新 |
| 删除检测 | **P2 · 仅强制刷做对账差集** | 增量期间已删除内容会短暂残留；深度同步清理 |
| 历史时序 | **暂不做** | 严格 YAGNI，避免和 `contentDailyCache` 职责重叠 |

## 数据模型

### Dexie v12

新增 `creations` 表，**不改动任何已有 version 块**。Schema 升级在 `src/db/database.ts` 追加：

```ts
this.version(12).stores({
  creations:
    '[userId+contentId], userId, [userId+contentType], [userId+publishDate]',
});
```

### `CreationRecord`

```ts
export interface CreationRecord {
  userId: string;
  contentId: string;
  contentToken: string;
  contentType: 'article' | 'answer' | 'pin';
  title: string;
  publishDate: string;       // ISO YYYY-MM-DD
  readCount: number;
  upvoteCount: number;
  commentCount: number;
  collectCount: number;
  firstSeenAt: number;       // ms, 本地首次发现时间
  lastFetchedAt: number;     // ms, 本条最近一次被 API 命中的时间
}
```

`firstSeenAt` 的含义：**这条内容在本机缓存里第一次被看到的时间戳**。保留原因：该字段对 "未收录多久了" 这类未来分析有唯一价值；成本仅是 upsert 时多一次"合并旧行"的操作。若首次出现则 `firstSeenAt = Date.now()`，若已有则保留原值。

### `lastSyncedAt` 存储

每个 `userId` 上一次成功刷新（增量或强制）的时间戳，用 `chrome.storage.local` 单独 key 存：

```
chrome.storage.local: {
  'creations-last-synced': {
    [userId: string]: number  // ms timestamp
  }
}
```

不建新 Dexie 表的原因：这是个单字段 map，比开一张表更轻；也避免污染 `userSettings` 的业务语义。

## Store 模块 · `src/db/creations-store.ts`

唯一接触 `db.creations` 表的层。组件/handler 不能直接 `import { db }` 做创作表的查询。

```ts
import type { CreationItem } from '@/api/zhihu-creations';

export interface CreationRecord { /* 见上 */ }

/** 读全部（按 userId） */
export async function getCreations(userId: string): Promise<CreationRecord[]>;

/** 读全部的 contentId 集合（用于增量短路 + 对账差集） */
export async function getCreationContentIds(userId: string): Promise<Set<string>>;

/** 读上次同步时间戳 */
export async function getCreationsLastSyncedAt(userId: string): Promise<number | null>;

/** 写上次同步时间戳 */
export async function setCreationsLastSyncedAt(userId: string, ts: number): Promise<void>;

/**
 * 批量 upsert：合并旧行的 firstSeenAt，刷新 lastFetchedAt 和计数字段。
 * 返回本次操作中新增（此前表里没有）的 contentId 数量。
 */
export async function upsertCreations(
  userId: string,
  items: CreationItem[],
): Promise<{ addedCount: number }>;

/**
 * 对账清理：从表里删除所有 contentId 不在 aliveContentIds 中的行。
 * 只在深度同步（force）路径调用。返回实际删除数量。
 */
export async function reconcileCreations(
  userId: string,
  aliveContentIds: Set<string>,
): Promise<{ deletedCount: number }>;
```

实现要点：

- `upsertCreations` 的合并逻辑：先 `where('userId').equals(uid).toArray()` 一次性把旧行拉到内存，构造 `Map<contentId, CreationRecord>`；对每个新 item，若已存在则保留旧 `firstSeenAt`，否则赋 `Date.now()`；再 `bulkPut`。`addedCount = new items not in old map`。
- `reconcileCreations` 使用 `primaryKeys()` 拿到全部 `[userId+contentId]` 主键数组，过滤出不在 `aliveContentIds` 中的 contentId，然后 `bulkDelete` 对应主键。
- 所有函数使用 `async/await`，错误让 Dexie 的 Promise 正常抛出，由 handler 统一包装成 `ErrorResponse`。

## API 层调整 · `src/api/zhihu-creations.ts`

`fetchAllCreations` 增加可选 `options` 形参以支持增量短路：

```ts
export interface FetchAllCreationsOptions {
  onProgress?: (fetched: number, total: number) => void;
  /** 若提供，当分页响应里出现任一已知 contentId 时立即停止分页并返回。 */
  stopAt?: Set<string>;
}

export async function fetchAllCreations(
  options?: FetchAllCreationsOptions | ((fetched: number, total: number) => void),
): Promise<CreationItem[]>
```

**向后兼容**：`options` 也接受旧的回调函数形态（`useSyncOrchestration` 现在传回调）。若为函数则视作 `onProgress`。

**短路语义**：遍历分页响应时，只要当前页包含 `stopAt.has(item.contentId)` 的任一项，将该页中**在该项之前**的新项加入结果，然后终止 `do...while`。这样既能拿到本批次所有新内容，又能在见到第一个已知 id 后立即停下（符合 API 按 `created` 倒序的假设）。

## 消息协议 · `src/shared/message-types.ts`

**保留** `fetchAllCreations`（消息和 handler 都不动），`useSyncOrchestration` 继续使用它拿实时全量。

**新增**两个消息：

### `loadCreationsCache`

纯读 DB，不打网络。面板挂载时第一时间调用。

```ts
interface LoadCreationsCacheRequest { action: 'loadCreationsCache' }

type LoadCreationsCacheResponse =
  | { ok: true; items: CreationRecord[]; lastSyncedAt: number | null }
  | ErrorResponse;
```

### `refreshCreations`

执行网络刷新并写库。`mode` 二选一。

```ts
interface RefreshCreationsRequest {
  action: 'refreshCreations';
  mode: 'incremental' | 'force';
}

type RefreshCreationsResponse =
  | {
      ok: true;
      items: CreationRecord[];
      lastSyncedAt: number;
      addedCount: number;     // 新增行数
      deletedCount: number;   // 仅 force 模式可能 > 0
    }
  | ErrorResponse;
```

## Service-Worker Handler

在 `src/background/service-worker.ts` 新增两个 case：

### `loadCreationsCache`

```ts
const user = await fetchCurrentUser();
const items = await getCreations(user.id);
const lastSyncedAt = await getCreationsLastSyncedAt(user.id);
respond({ ok: true, items, lastSyncedAt });
```

### `refreshCreations`

```ts
const user = await fetchCurrentUser();

if (message.mode === 'incremental') {
  const stopAt = await getCreationContentIds(user.id);
  const fresh = await fetchAllCreations({ stopAt });
  const { addedCount } = await upsertCreations(user.id, fresh);
  const ts = Date.now();
  await setCreationsLastSyncedAt(user.id, ts);
  const items = await getCreations(user.id);
  respond({ ok: true, items, lastSyncedAt: ts, addedCount, deletedCount: 0 });
  return;
}

// force
const fresh = await fetchAllCreations();
const { addedCount } = await upsertCreations(user.id, fresh);
const aliveIds = new Set(fresh.map((c) => c.contentId));
const { deletedCount } = await reconcileCreations(user.id, aliveIds);
const ts = Date.now();
await setCreationsLastSyncedAt(user.id, ts);
const items = await getCreations(user.id);
respond({ ok: true, items, lastSyncedAt: ts, addedCount, deletedCount });
```

注：handler 里 `addLog` 打印与现有 `fetchAllCreations` handler 对齐（"正在获取..."、"已获取 X/Y 篇"等），便于调试。

## UI · `UnmonetizedContentPanel.tsx`

### 挂载行为

```
useEffect(() => {
  // 1) 立刻读缓存
  const { items, lastSyncedAt } = await sendMsg({ action: 'loadCreationsCache' });
  setState({ items, lastSyncedAt });

  // 2) 弱 TTL 检查：若距上次同步 < 5 分钟，跳过自动增量
  if (lastSyncedAt && Date.now() - lastSyncedAt < 5 * 60 * 1000) return;

  // 3) 后台触发一次增量刷新
  setBackgroundRefreshing(true);
  const refreshed = await sendMsg({ action: 'refreshCreations', mode: 'incremental' });
  setState(refreshed);
  setBackgroundRefreshing(false);
  if (refreshed.addedCount > 0) toast(`已新增 ${refreshed.addedCount} 条内容`);
}, []);
```

### 渲染规则

- 若 `items == null`（缓存未加载完）：保持原有"点击右上角按钮，获取列表"占位态。
- 若 `items != null` 且 `items.length === 0`：展示 `Empty` 空态 "所有内容都已产生收益"。
- 若 `items.length > 0`：
  - 卡片标题下方新增一行说明："共 N 篇内容尚未被致知计划收录或产生收益 · 上次同步于 X 前"。
  - `backgroundRefreshing === true` 时在时间戳旁显示小 `LoadingOutlined`。

### 按钮区（`Card.extra`）

两个按钮并排：

| 按钮 | 图标 | 点击行为 |
| --- | --- | --- |
| `刷新` | `ReloadOutlined` | `refreshCreations { mode: 'incremental' }`，loading 期间禁用 |
| `深度同步` | `SyncOutlined` | `refreshCreations { mode: 'force' }`，tooltip 写明"完整扫描并清理已删除内容，请求较多" |

- 成功后 toast：
  - 增量：`addedCount > 0` → "已新增 N 条"；否则静默。
  - 强制：永远展示 "已更新 N 条" + 若 `deletedCount > 0` 追加 "，清理 M 条已删除"。

### 过滤与现有 props

`items` 现在是 `CreationRecord[]` 而非 `CreationItem[]`。对 UI 展示无影响（字段是超集）。过滤依然使用 `monetizedContentTokens.has(item.contentToken)`。

### Demo 模式

保持现状：`demoMode` 真时渲染 `DEMO_UNMONETIZED`，不触发任何消息。

## 测试策略

新增：

- `tests/db/creations-store.test.ts`
  - `getCreations` 空表返回空数组
  - `upsertCreations` 首次插入：`firstSeenAt` 被赋为 `Date.now()`，`addedCount === items.length`
  - `upsertCreations` 再次插入相同 contentId：`firstSeenAt` 保留旧值，计数字段被覆盖，`addedCount === 0`
  - `upsertCreations` 混合新旧 id：`addedCount` 等于新 id 数量
  - `getCreationContentIds` 返回 Set，大小与行数相等
  - `reconcileCreations` 删除差集外的行，返回正确 `deletedCount`
  - `getCreationsLastSyncedAt` / `setCreationsLastSyncedAt` 往返一致
  - 多 userId 隔离：不同 userId 的行互不影响

- `tests/api/zhihu-creations.test.ts` 追加
  - `stopAt` 命中时立即停止分页
  - `stopAt` 为空时行为等价于旧版
  - 向后兼容：传函数仍作为 `onProgress` 工作

- `tests/background/service-worker.test.ts` 追加
  - `loadCreationsCache` handler 路由正确，返回 `{ ok, items, lastSyncedAt }`
  - `refreshCreations { mode: 'incremental' }` 调用 `fetchAllCreations` 带 `stopAt`
  - `refreshCreations { mode: 'force' }` 调用 `fetchAllCreations` 不带 `stopAt` 并执行 reconcile

修改：

- 无。现有对 `fetchAllCreations` 消息的 mock 保持不变（消息未动）。
- `tests/dashboard/components/content-components.test.tsx` 中 `UnmonetizedContentPanel` 的测试（若有）需要补 mock 新消息。实际检查时再决定。

覆盖率目标：本次修改的新增代码 ≥ 90%。项目阈值（lines 80 / functions 60 / branches 75 / statements 80）不得退化。

## 验收清单

- [ ] Dexie v12 迁移能在既有 v11 数据库上平滑升级（新表为空即可）。
- [ ] 第一次打开面板：拉全量 → 存 DB → 渲染 → `lastSyncedAt` 更新。
- [ ] 第二次打开面板（5 分钟内）：只读缓存，不打网络，秒开。
- [ ] 第二次打开面板（超过 5 分钟）：秒开缓存 + 后台增量刷新 + 有新增时 toast。
- [ ] 删除一篇文章 → 点击"深度同步" → 面板不再出现那条。
- [ ] 点击"刷新"时，老文章计数**不变**（这是预期行为，需在 tooltip 或说明里让用户理解）。
- [ ] `useSyncOrchestration` 的"内容详情"/"全部同步"路径不受影响。
- [ ] `yarn build`、`yarn test:coverage`、`yarn lint` 全绿。

## 未来扩展（后续再说）

- `creationsHistory` 表存按日快照，支撑"内容冷启动曲线"等时序分析。
- 将 `creations` 表纳入 `export-import` 的 JSON 备份。
- 在 `auto-sync` 的 alarm 里顺便增量刷一次，让面板打开时几乎总是"刚同步过"。
- 按 `firstSeenAt` 做"长期未收益内容"的专题面板。

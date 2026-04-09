# 知析 — 工程质量 & 社交功能设计文档

**日期：** 2026-04-08
**状态：** 已确认
**实施顺序：** D1 → D2 → D3 → D4 → E1 → E2 → E3

---

## D1：TypeScript `any` 类型清理

### 目标

消除所有 `@typescript-eslint/no-explicit-any` 警告，ESLint 规则从 `warn` 升级为 `error`。

### 做法

- 逐文件排查，用具体类型替换 `any`：
  - API 响应使用 `api-types.ts` 中已有的类型
  - Chrome 消息使用 `message-types.ts` 中的类型
  - 其余使用泛型或 `unknown`
- 第三方库缺少类型的场景，编写局部 `.d.ts` 声明
- 最终将 ESLint 规则改为 `error`，防止回退

### 验收标准

- `npm run lint` 零 `any` 相关警告
- 构建正常通过
- 现有测试全部通过

---

## D2：测试覆盖率提升至 80%+

### 现状

16 个测试文件，主要覆盖 shared 工具函数、DB 存储层、API 层。Dashboard 组件和大部分 hooks 缺少测试。

### 补测策略

| 优先级 | 测试目标 | 测试类型 | 说明 |
|--------|---------|---------|------|
| P0 | dashboard hooks（useSyncOrchestration, useTourManagement, usePanelLayout） | 单元测试 | 核心状态逻辑，mock Dexie |
| P0 | shared hooks（use-current-user, use-user-settings） | 单元测试 | 用户会话和设置管理 |
| P1 | dashboard 组件（ContentTable, DailyTrendChart, IncomeGoalPanel 等高交互组件） | 组件测试 | @testing-library/react，验证渲染和交互 |
| P1 | API 层补充（zhihu-creations, zhihu-content-daily, zhihu-realtime） | 单元测试 | mock fetch，验证解析逻辑 |
| P2 | DB 层补充（content-daily-store, realtime-store, goal-store） | 单元测试 | fake-indexeddb |
| P2 | 纯展示组件（WeeklySeasonalityChart, PublishTimeAnalysis 等） | 快照测试 | 确保渲染不崩溃即可 |

### 不做的事

- 不为 ECharts 图表内部做像素级测试
- 不为 ML 训练过程写 E2E 测试（TensorFlow.js 在测试环境不稳定）

### 验收标准

- `npm run test:coverage` 总行覆盖率 >= 80%
- 所有测试通过且无 flaky test

---

## D3：CI/CD 流水线

### 参照项目

DownloadZhihu（`/Users/chouheiwa/Desktop/web/chrome插件/DownloadZhihu/.github/workflows/release.yml`）

### 触发机制

- `v*` tag push 触发 release workflow
- `push` / `pull_request` 到 main 触发 CI check workflow

### CI Check Workflow（`.github/workflows/ci.yml`）

```
push/PR to main → install → lint → type-check → test + coverage → build
```

- 任一步骤失败即阻断合并
- 覆盖率报告作为 artifact 上传

### Release Workflow（`.github/workflows/release.yml`）

```
tag push (v*) → install → 版本校验(manifest.ts vs tag) → lint → test → build → ZIP 打包 → GitHub Release
```

- 从 tag 提取版本号，校验 `src/manifest.ts` 中版本一致
- ZIP 命名：`zhihu-analysis-v{VERSION}.zip`
- Release 自动附带安装说明（Chrome / Edge 手动安装步骤）

### 新增 package.json scripts

```json
"type-check": "tsc --noEmit",
"ci": "npm run lint && npm run type-check && npm run test:coverage && npm run build"
```

### 版本管理

- `src/manifest.ts` 为单一版本源
- 手动更新版本 + 打 tag 触发发布

---

## D4：Chrome/Edge Web Store 发布配置

### 条件式发布

在 release workflow 中追加两个 job，通过 feature flag 控制。

### Chrome Web Store

- 条件：`vars.CHROME_STORE_ENABLED == 'true'`
- 认证：Service Account + JWT OAuth 流程
- 所需 Secrets：`CHROME_EXTENSION_ID`、`CHROME_PUBLISHER_ID`、`CHROME_SERVICE_ACCOUNT_JSON`
- 流程：上传 ZIP → 提交审核

### Edge Add-ons

- 条件：`vars.EDGE_STORE_ENABLED == 'true'`
- 工具：`wdzeng/edge-addon@v2` Action
- 所需 Secrets：`EDGE_PRODUCT_ID`、`EDGE_CLIENT_ID`、`EDGE_API_KEY`

### 默认状态

两个 flag 都为 `false`，不影响正常 release 流程。配好 Secrets 并开启 flag 后自动生效。

---

## E1：多账号管理

### 架构设计

基于现有 `userSettings` 表的 `userId` 字段，所有数据表本身已按 userId 索引，无需改 DB schema。核心工作在 UI 层。

### 新增组件

- `AccountSwitcher` — 顶部导航栏的账号切换下拉菜单，显示当前账号昵称/头像
- `AccountManager` — 设置页中的账号管理面板（账号列表、删除、设为默认）

### 工作流程

1. 用户在知乎网页登录账号 A → 打开插件 popup → 自动识别并记录账号 A
2. 用户切换知乎登录到账号 B → 打开插件 → 自动识别新账号，加入账号列表
3. Dashboard 顶部可切换查看不同账号的数据，互不干扰

### 存储

- 新增 `activeAccount` 字段到 `userSettings`，记录当前查看的账号 ID
- 账号元信息（昵称、头像 URL）缓存在 `userSettings` 中

### 不做的事

- 不做跨账号数据聚合
- 不做同时登录多账号（受限于知乎 cookie 机制）

---

## E2：收益成就分享卡片

### 视觉风格

游戏化成就徽章风

### 卡片类型（4 种模板）

| 模板 | 触发场景 | 展示内容 |
|------|---------|---------|
| 月度战报 | 手动生成 | 本月总收益、日均收益、最佳单日、环比增长率、等级徽章 |
| 里程碑达成 | 达成里程碑时 | 里程碑名称、达成日期、徽章图标、累计成就数 |
| 爆款内容 | 手动选择内容 | 内容标题、收益、PV、RPM、排名百分位、星级评分 |
| 年度总结 | 手动生成 | 全年收益、内容数量、最佳月份、RPM 趋势、成长轨迹 |

### 技术方案

- Canvas API 绘制卡片（不依赖额外库，bundle 体积零增加）
- 卡片尺寸：1080x1350px（适配社交平台竖图比例）
- 渲染流程：数据 → Canvas 绘制 → 导出为 PNG
- 入口：Dashboard 右上角「生成卡片」按钮 + 里程碑页面的分享按钮

### 视觉元素

- 等级系统：根据累计收益划分段位（青铜/白银/黄金/铂金/钻石），对应不同徽章
- 进度条：距下一等级的进度
- 装饰：星星、光效等游戏化元素
- 配色：深色底 + 金色/渐变亮色强调，突出成就感

### 不做的事

- 不做实时预览编辑器
- 不做自定义模板（4 种预设够用）

---

## E3：数据快照 HTML 报告

### 功能

将当前账号的数据导出为一个独立的 HTML 文件，无需安装插件即可在任意浏览器打开查看。

### 报告内容

- 概览：总收益、内容数量、日均收益、活跃天数
- 收益趋势图：按日/周/月的折线图
- 内容排行榜：TOP 10 内容（按收益排序）
- RPM 分析：各内容类型的千次阅读收益
- 数据表格：完整内容列表，支持排序

### 技术方案

- 生成单一 `.html` 文件（所有 CSS/JS/数据内联，零外部依赖）
- 图表使用内联的轻量 SVG 绘制（不打包 ECharts，控制文件体积在 500KB 以内）
- 数据以 JSON 形式嵌入 `<script>` 标签
- 报告内自带简单的排序/筛选交互（原生 JS）

### 入口

- Dashboard 现有的导出按钮旁新增「导出 HTML 报告」选项
- 点击后直接触发浏览器下载

### 不做的事

- 不嵌入完整的 React/ECharts（体积不可控）
- 不做在线托管/分享链接（保持纯本地模式）

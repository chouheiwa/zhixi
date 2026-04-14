# 知析（Zhixi）隐私政策

**最后更新：2026-04-14**

知析（以下简称"本扩展"）是一款完全在用户本地浏览器中运行的浏览器扩展，用于分析用户自己在知乎致知计划的创作者收益和内容数据。本扩展同时发布在 Chrome Web Store 和 Mozilla Add-ons (AMO)，两个平台共用本政策。

## 1. 我们不收集任何数据

本扩展的开发者**不接收、不访问、不存储、不传输**任何用户数据。没有服务器、没有后端、没有分析平台、没有埋点、没有遥测。

所有数据采集与处理均发生在用户自己的浏览器内，全部保存在扩展私有的 IndexedDB 中。

## 2. 本扩展如何处理数据

### 2.1 数据来源

本扩展调用知乎创作者后台的官方 API 读取用户自己的创作者分析数据，涉及以下接口：

- `/api/v4/creators/analysis/income/all` — 每日致知计划收益记录
- `/api/v4/creators/analysis/realtime/content/daily` — 单篇内容每日指标
- `/api/v4/creators/analysis/realtime/member/aggr` — 账号实时汇总数据
- `/api/v4/creators/creations/v2/all` — 内容列表（用于识别未变现内容）

这些 API 请求由**浏览器自身**发送到 `https://www.zhihu.com`，携带用户已登录 zhihu.com 时浏览器持有的 Cookie。本扩展不代理、不拦截、不解析、不记录这些 Cookie 或任何身份凭据。

### 2.2 数据存储

采集到的数据写入扩展私有的 IndexedDB（基于 Dexie ORM，schema v11），包括：

- 每日收益记录
- 每日内容指标
- 实时账号汇总
- 内容列表缓存
- 用户设置（面板布局、收益目标、货币单位等）
- 用户训练生成的机器学习模型（随机森林 + 岭回归 + MLP 集成模型）

这些数据**仅保存在用户本地浏览器内**，不会上传到开发者或任何第三方的服务器。

### 2.3 数据用途

仅用于在扩展自身的 Dashboard 页面向用户本人展示可视化分析、趋势预测和 ML 推荐，不用于任何其他目的。

### 2.4 数据共享

本扩展不向任何第三方（包括开发者本人）共享、出售或传输用户数据。

## 3. 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 在本地持久化扩展设置、面板布局、采集数据和训练好的 ML 模型 |
| `tabs` | 打开扩展自身的 Dashboard 分析页；检测用户打开知乎标签页时触发机会性同步 |
| `alarms` | 通过 `chrome.alarms` 定时在后台执行增量数据同步 |
| `notifications` | 在后台同步完成或失败时通知用户 |
| `https://www.zhihu.com/*` | 调用知乎创作者后台 API 拉取用户自己的分析数据 |

在 Firefox 中，`https://www.zhihu.com/*` 属于**可选权限（optional permission）**，用户首次使用扩展时会通过 `chrome.permissions.request` 在用户手势内被显式请求。未授权前，所有数据采集功能均不会运行。

## 4. 远程代码

本扩展**不加载或执行任何远程代码**。所有 JavaScript 和 WebAssembly 资源——包括 `@tensorflow/tfjs`、`ml-random-forest`、`antd`、`echarts` 及其所有依赖——均由 Vite + `@crxjs/vite-plugin` 在构建期静态打包进扩展产物，不存在 `<script>` 外链、运行时 `eval()` 或远程动态 `import()`。

## 5. 数据删除

用户可以随时通过以下方式彻底删除本扩展存储的所有数据：

- **卸载扩展**：在 Chrome 或 Firefox 的扩展管理页面卸载知析，所有 IndexedDB 数据会随扩展一起清除。
- **撤销权限**：在 Firefox 的 `about:addons` → 权限中撤销对 `zhihu.com` 的访问权，扩展将停止采集新数据（但已采集的本地数据保持不变，可通过卸载清除）。
- **在扩展内清空**：通过 Dashboard 的导出/导入界面手动清空数据表。

## 6. 适用法律

本扩展是开源项目（GPL-3.0），不面向任何特定司法管辖区运营。由于开发者不收集、不处理、不存储任何用户数据，本扩展不涉及 GDPR、CCPA 等法规下的"数据控制者"或"数据处理者"角色。

## 7. 开源与联系方式

- **源代码（GPL-3.0）**：<https://github.com/chouheiwa/zhixi>
- **问题反馈**：<https://github.com/chouheiwa/zhixi/issues>

本政策如有修改，会在本文件的 Git 历史中留下完整记录。重大变更会在扩展的"新功能"横幅中通知用户。

---

## English Summary

Zhixi (知析) is a browser extension that runs entirely on the user's local machine. The developer does not collect, receive, store, or transmit any user data.

All analytics data is fetched via the user's own zhihu.com session, stored exclusively in the extension's private IndexedDB, and never leaves the user's browser. The extension makes no network requests to any third party, contains no telemetry, and loads no remote code.

Uninstalling the extension removes all locally stored data. Source code is available at <https://github.com/chouheiwa/zhixi> under GPL-3.0.

# Firefox 发布指南

本项目同时构建 Chrome 与 Firefox 两个产物。Chrome 包由 `yarn build` 产出到 `dist/`，Firefox 包由 `yarn build:firefox` 产出到 `dist-firefox/`。

## 快速命令

```bash
yarn build:firefox    # 先跑 yarn build，再跑 scripts/build-firefox.mjs 生成 Firefox 产物
yarn lint:firefox     # web-ext lint 检查 dist-firefox/
yarn run:firefox      # 在 Firefox Developer Edition 中临时安装扩展（热加载）
yarn package:firefox  # web-ext build 生成可上传 AMO 的 .zip
```

## 构建架构

`@crxjs/vite-plugin` 主要服务 Chrome MV3。为了避开 Firefox 与 Chrome 的以下差异，我们用一个**后处理脚本**在 Chrome 产物基础上生成 Firefox 产物：

1. Firefox 115 ESR 不支持 `background.type: "module"`：必须使用 `background.scripts: [...]` 且入口是经典脚本。
2. Vite 的 `manualChunks` 会产生 chunk 间的 side-effect import，直接复用 Chrome 的 service-worker chunk 会把 antd/echarts 整个拖进 background bundle。
3. `browser_specific_settings.gecko` 仅 Firefox 识别，Chrome 写进 manifest 会带来 @crxjs 类型层面的 warning。

`scripts/build-firefox.mjs` 的流程：

1. 把 `dist/` 全量复制到 `dist-firefox/`（dashboard、popup、icons、共享 chunk 都继续由 Vite 产出）
2. 使用 `esbuild` **直接以 `src/background/service-worker.ts` 为入口**重新打包一份 IIFE 格式的 `background.js`（完全绕开 Vite 的 chunking 输出，避免 antd 等 UI 库被拖进 SW bundle）
3. 改写 `dist-firefox/manifest.json`：
   - 移除 `background.service_worker` 与 `background.type`
   - 加入 `background.scripts: ["background.js"]`
   - 注入 `browser_specific_settings.gecko.{id, strict_min_version}`
4. 清理 `dist-firefox/service-worker-loader.js` 和 `dist-firefox/assets/service-worker.ts-*.js`（已被 `background.js` 取代）
5. 写 `dist-firefox/.build-info.json`，记录构建时间戳、git SHA、Node 版本，便于 AMO 审核员复现

如果后续发现 SW bundle 意外拖进了 UI 库（例如有人在 `@/shared/` 里加了一个同时被 dashboard 和 service-worker 使用的模块，而该模块又 `import ... from 'antd'`），`build-firefox.mjs` 会在 `metafile` 阶段 fail 并报出泄漏的包名。

## `host_permissions` 的差异

Chrome MV3 在安装时强制授予 `host_permissions`，Firefox MV3 把它视为**可选权限**：用户首次装完扩展后，默认没有 `https://www.zhihu.com/*` 的访问权，所有带 cookie 的 fetch 都会被拒绝。

`src/shared/host-permissions.ts` 封装了 `hasZhihuHostPermission` / `requestZhihuHostPermission`。Popup 与 Dashboard 在首次渲染时都会检测授权状态，未授权时展示一个"授权访问 zhihu.com"按钮；点击后在用户手势回调内调用 `chrome.permissions.request` 弹出原生授权窗，成功后刷新页面让所有数据 hook 重新初始化。

Service worker 的两处 auto-sync（知乎标签页打开、`chrome.alarms.onAlarm`）在执行前同样会检查 `hasZhihuHostPermission`，未授权时直接 silent return。

这些改动在 Chrome 下完全是 no-op，行为零变化。

## Gecko 扩展 ID

在 `scripts/build-firefox.mjs` 顶部：

```js
const GECKO_ID = 'zhixi@chouheiwa.dev';
const GECKO_MIN_VERSION = '115.0';
```

这个 ID 在首次上传到 AMO 时被锁定，之后**不能修改**（否则 Firefox 会把新版本当成完全不同的扩展）。如果需要在本地调试时用不同的 ID 可以改脚本常量再跑 `yarn build:firefox`，但正式上传到 AMO 请严格用 `zhixi@chouheiwa.dev`。

## AMO 首次提交清单

1. **Firefox 账号** — 到 <https://addons.mozilla.org/developers/> 注册，同意开发者分发协议
2. **构建 xpi**

   ```bash
   yarn install --frozen-lockfile
   yarn build:firefox
   yarn lint:firefox            # 必须 0 errors
   yarn package:firefox          # 产出 web-ext-artifacts/*.zip
   ```

3. **准备源代码包（mandatory）** — AMO 审核员必须能用同样的源码复现出字节级一致的 xpi。打包这些到单独的 `source.zip` 上传：
   - `src/`（不含 node_modules）
   - `scripts/`
   - `package.json`、`yarn.lock`
   - `tsconfig.json`、`vite.config.ts`
   - 本文件（`docs/firefox-release.md`）
   - 在 AMO 的 "Source code" 说明栏填写：
     ```
     Node 20.x (or current LTS)
     yarn install --frozen-lockfile
     yarn build:firefox
     Output: dist-firefox/ — this is the exact content of the uploaded xpi.
     Reproducibility info is in dist-firefox/.build-info.json
     ```
4. **填写 AMO 元数据**：
   - **分类**：Other / Shopping / Productivity（按审核反馈调整）
   - **Summary**：中英双语皆可
   - **Description**：完整介绍插件功能（数据采集、收益分析、ML 预测），重点说明"所有数据仅在本地 IndexedDB，不上传任何第三方服务器"
   - **隐私政策**：必须 present。建议模板见下文
   - **截图**：至少 3 张，覆盖 popup、dashboard 总览、详情页
   - **默认语言**：zh-CN
   - **发布渠道**：首版建议 **Listed**（面向 AMO 所有用户）
5. **提交审核** — Listed 版通常 1–5 天出结果

### 隐私政策模板

```
知析是一款完全在本地运行的浏览器扩展。它的工作方式如下：

1. 数据来源
   - 本扩展读取你登录 zhihu.com 后的创作者后台 API（知乎致知计划、内容数据、收益等），
     这些 API 调用都通过浏览器自身的请求发送到 zhihu.com，扩展不代理、不拦截、不记录
     你的 Cookie 或身份凭据。

2. 数据存储
   - 所有采集到的数据（日收益、文章列表、内容每日指标、机器学习模型等）都保存在
     你本地浏览器的 IndexedDB 中，从不上传到任何第三方服务器。

3. 网络权限
   - 扩展只对 https://www.zhihu.com/* 发起请求。

4. 数据删除
   - 你可以在浏览器扩展管理页面卸载本扩展，IndexedDB 中的所有数据会随之清除。
   - 也可以在 about:addons 的 "权限" 中随时撤销对 zhihu.com 的访问权限。
```

## 自动化签名（后续版本迭代）

首版上线后，后续版本可以通过 `web-ext sign` 用 CI 自动发布：

```bash
# 在 https://addons.mozilla.org/developers/addon/api/key/ 生成 JWT issuer/secret
export AMO_JWT_ISSUER="user:xxxxx:yyy"
export AMO_JWT_SECRET="yyyyyyyyyyyy"

npx web-ext sign \
  --source-dir=dist-firefox \
  --api-key=$AMO_JWT_ISSUER \
  --api-secret=$AMO_JWT_SECRET \
  --channel=listed
```

- `--channel=listed`：自动提交到 AMO 审核队列
- `--channel=unlisted`：仅自动签名生成可自分发的 xpi，不上架

## 常见审核驳回原因 & 对策

1. **"Remote code execution"** — 审核员看到打包体中有 `eval` / `new Function` / 动态 `import(http...)`。本项目的 `tfjs` 历史版本曾有此问题，打包前要跑 `yarn lint:firefox` 排查 warning；若确认是 tfjs 内置 wasm 加载，在 Source code 说明栏明确告知。
2. **"Minified/Obfuscated code"** — `build-firefox.mjs` 明确设置 `minify: false` 且 `sourcemap: 'inline'`，满足可读性要求。
3. **"Permission not justified"** — `tabs` 权限需要在 AMO 的 Permissions 说明里写清楚用途（用于打开 dashboard 页面以及监听知乎标签页完成加载以触发 auto-sync）。
4. **"Source doesn't build"** — 先在全新目录跑 `yarn install --frozen-lockfile && yarn build:firefox` 确认成功，再上传。避免本地修改被忘记提交。
5. **"manifest v3 background is broken in Firefox 115"** — 如果审核员反馈 background 没启动，通常是 `background.js` 写成了 ESM 或用了 top-level await。`build-firefox.mjs` 以 `format: 'iife'` + `target: firefox115` 配置 esbuild，已避开此问题。

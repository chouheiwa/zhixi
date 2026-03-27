import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "知乎致知计划收益分析",
  description: "知乎致知计划每日收益数据采集与多维度分析",
  version: "1.0.0",
  permissions: ["storage", "tabs"],
  host_permissions: ["https://www.zhihu.com/*"],
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  action: {
    default_popup: "src/popup/index.html",
  },
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
});

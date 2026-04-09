# D1+D3+D4: ESLint 升级 + CI/CD 流水线 + 商店发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ESLint `any` 规则升级为 error，搭建 GitHub Actions CI check + tag-triggered release 流水线，支持条件式 Chrome/Edge 商店发布。

**Architecture:** 参照 DownloadZhihu 项目的 release.yml，适配知析项目（增加 lint/test/type-check 步骤）。CI check workflow 在每次 push/PR 时运行完整检查。Release workflow 在 tag push 时构建并发布。

**Tech Stack:** GitHub Actions, Node.js 20, Vite + CRXJS, Vitest, TypeScript

---

### Task 1: ESLint `any` 规则升级

**Files:**
- Modify: `eslint.config.js:16-17`

- [ ] **Step 1: 升级 ESLint 规则**

```javascript
// eslint.config.js line 16-17, change:
// TODO: upgrade to 'error' after eliminating all any types (Phase 2)
'@typescript-eslint/no-explicit-any': 'warn',

// to:
'@typescript-eslint/no-explicit-any': 'error',
```

- [ ] **Step 2: 验证 lint 通过**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npm run lint`
Expected: 0 errors, 0 warnings related to `no-explicit-any`

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: upgrade no-explicit-any from warn to error"
```

---

### Task 2: 添加 type-check script

**Files:**
- Modify: `package.json:8-14` (scripts section)

- [ ] **Step 1: 添加 type-check 和 ci scripts**

在 `package.json` 的 `scripts` 中添加：

```json
"type-check": "tsc --noEmit",
"ci": "npm run lint && npm run type-check && npm run test:coverage && npm run build"
```

- [ ] **Step 2: 验证 type-check 通过**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npx tsc --noEmit`
Expected: 无类型错误输出

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add type-check and ci scripts"
```

---

### Task 3: 创建 CI Check Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 创建 workflow 目录**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: 创建 ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Test with coverage
        run: npm run test:coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/

      - name: Build
        run: npm run build
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI check workflow for push and PR"
```

---

### Task 4: 创建 Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: 创建 release.yml**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.VERSION }}
      zip_name: ${{ steps.build.outputs.ZIP_NAME }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Extract version from tag
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> "$GITHUB_OUTPUT"

      - name: Verify manifest version matches tag
        run: |
          MANIFEST_VERSION=$(grep -oP "version:\s*'(\K[^']+)" src/manifest.ts)
          TAG_VERSION=${{ steps.version.outputs.VERSION }}
          if [ "$MANIFEST_VERSION" != "$TAG_VERSION" ]; then
            echo "::error::src/manifest.ts version ($MANIFEST_VERSION) does not match tag (v$TAG_VERSION)"
            exit 1
          fi

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Test
        run: npm run test:coverage

      - name: Build extension
        run: npm run build

      - name: Build ZIP
        id: build
        run: |
          ZIP_NAME="zhihu-analysis-v${{ steps.version.outputs.VERSION }}.zip"
          cd dist
          zip -r "../$ZIP_NAME" . -x "*.DS_Store"
          cd ..
          echo "ZIP_NAME=$ZIP_NAME" >> "$GITHUB_OUTPUT"

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: extension-zip
          path: ${{ steps.build.outputs.ZIP_NAME }}

  github-release:
    needs: build
    runs-on: ubuntu-latest

    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
        with:
          name: extension-zip

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          name: v${{ needs.build.outputs.version }}
          body: |
            ## 安装方法

            ### Chrome
            1. 下载下方的 `${{ needs.build.outputs.zip_name }}` 文件
            2. 解压到一个固定位置
            3. 打开 Chrome，访问 `chrome://extensions/`
            4. 右上角开启「开发者模式」
            5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

            ### Edge
            1. 下载下方的 `${{ needs.build.outputs.zip_name }}` 文件
            2. 解压到一个固定位置
            3. 打开 Edge，访问 `edge://extensions/`
            4. 左下角开启「开发人员模式」
            5. 点击「加载解压缩的扩展」，选择解压后的文件夹

            打开知析 Dashboard 即可查看收益分析数据。
          files: ${{ needs.build.outputs.zip_name }}

  # ==========================================
  # Chrome Web Store 自动发布（Service Account + Chrome Web Store API V2）
  # ==========================================
  # 需要在仓库 Settings → Secrets 中配置：
  #   CHROME_EXTENSION_ID          — 扩展 ID
  #   CHROME_PUBLISHER_ID          — 发布者 ID（从开发者控制台获取）
  #   CHROME_SERVICE_ACCOUNT_JSON  — Service Account JSON 密钥（整个文件内容）
  publish-chrome:
    needs: build
    if: vars.CHROME_STORE_ENABLED == 'true'
    runs-on: ubuntu-latest

    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
        with:
          name: extension-zip

      - name: Publish to Chrome Web Store
        env:
          CHROME_EXTENSION_ID: ${{ secrets.CHROME_EXTENSION_ID }}
          CHROME_PUBLISHER_ID: ${{ secrets.CHROME_PUBLISHER_ID }}
          CHROME_SERVICE_ACCOUNT_JSON: ${{ secrets.CHROME_SERVICE_ACCOUNT_JSON }}
        run: |
          set -e

          # 1. 从 Service Account JSON 中提取信息并构造 JWT
          echo "::group::Fetching access token via Service Account"
          SA_EMAIL=$(echo "$CHROME_SERVICE_ACCOUNT_JSON" | jq -r '.client_email')
          SA_KEY=$(echo "$CHROME_SERVICE_ACCOUNT_JSON" | jq -r '.private_key')

          NOW=$(date +%s)
          EXP=$((NOW + 3600))
          SCOPE="https://www.googleapis.com/auth/chromewebstore"
          TOKEN_URI="https://oauth2.googleapis.com/token"

          # Base64url 编码函数
          b64url() {
            openssl base64 -A | tr '+/' '-_' | tr -d '='
          }

          # 构造 JWT Header 和 Payload
          JWT_HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
          JWT_PAYLOAD=$(printf '{"iss":"%s","scope":"%s","aud":"%s","iat":%d,"exp":%d}' \
            "$SA_EMAIL" "$SCOPE" "$TOKEN_URI" "$NOW" "$EXP" | b64url)

          # 用私钥签名
          JWT_SIGNATURE=$(printf '%s.%s' "$JWT_HEADER" "$JWT_PAYLOAD" | \
            openssl dgst -sha256 -sign <(echo "$SA_KEY") | b64url)

          JWT="${JWT_HEADER}.${JWT_PAYLOAD}.${JWT_SIGNATURE}"

          # 用 JWT 换取 Access Token
          TOKEN_RESPONSE=$(curl -s -f "$TOKEN_URI" \
            -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
            -d "assertion=${JWT}")
          ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
          if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
            echo "::error::Failed to obtain access token"
            echo "$TOKEN_RESPONSE"
            exit 1
          fi
          echo "Access token obtained successfully"
          echo "::endgroup::"

          # 2. 上传扩展包
          echo "::group::Uploading extension"
          UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" \
            -H "Authorization: Bearer ${ACCESS_TOKEN}" \
            -X POST \
            -T "${{ needs.build.outputs.zip_name }}" \
            "https://chromewebstore.googleapis.com/upload/v2/publishers/${CHROME_PUBLISHER_ID}/items/${CHROME_EXTENSION_ID}:upload")
          UPLOAD_HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -1)
          UPLOAD_BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')
          echo "Upload response (HTTP ${UPLOAD_HTTP_CODE}):"
          echo "$UPLOAD_BODY" | jq . 2>/dev/null || echo "$UPLOAD_BODY"
          if [ "$UPLOAD_HTTP_CODE" -lt 200 ] || [ "$UPLOAD_HTTP_CODE" -ge 300 ]; then
            echo "::error::Upload failed with HTTP ${UPLOAD_HTTP_CODE}"
            exit 1
          fi
          echo "::endgroup::"

          # 3. 提交发布
          echo "::group::Publishing extension"
          PUBLISH_RESPONSE=$(curl -s -w "\n%{http_code}" \
            -H "Authorization: Bearer ${ACCESS_TOKEN}" \
            -X POST \
            "https://chromewebstore.googleapis.com/v2/publishers/${CHROME_PUBLISHER_ID}/items/${CHROME_EXTENSION_ID}:publish")
          PUBLISH_HTTP_CODE=$(echo "$PUBLISH_RESPONSE" | tail -1)
          PUBLISH_BODY=$(echo "$PUBLISH_RESPONSE" | sed '$d')
          echo "Publish response (HTTP ${PUBLISH_HTTP_CODE}):"
          echo "$PUBLISH_BODY" | jq . 2>/dev/null || echo "$PUBLISH_BODY"
          if [ "$PUBLISH_HTTP_CODE" -lt 200 ] || [ "$PUBLISH_HTTP_CODE" -ge 300 ]; then
            echo "::error::Publish failed with HTTP ${PUBLISH_HTTP_CODE}"
            exit 1
          fi
          echo "Extension published successfully!"
          echo "::endgroup::"

  # ==========================================
  # Edge Add-ons 自动发布
  # ==========================================
  # 需要在仓库 Settings → Secrets 中配置：
  #   EDGE_PRODUCT_ID  — 产品 ID（从 Partner Center 获取）
  #   EDGE_CLIENT_ID   — API 客户端 ID
  #   EDGE_API_KEY     — API 密钥（client secret）
  publish-edge:
    needs: build
    if: vars.EDGE_STORE_ENABLED == 'true'
    runs-on: ubuntu-latest

    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
        with:
          name: extension-zip

      - name: Publish to Edge Add-ons
        uses: wdzeng/edge-addon@v2
        with:
          product-id: ${{ secrets.EDGE_PRODUCT_ID }}
          zip-path: ${{ needs.build.outputs.zip_name }}
          client-id: ${{ secrets.EDGE_CLIENT_ID }}
          api-key: ${{ secrets.EDGE_API_KEY }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered release workflow with Chrome/Edge store publishing"
```

---

### Task 5: 添加覆盖率阈值配置

**Files:**
- Modify: `vite.config.ts:28-38` (test.coverage section)

- [ ] **Step 1: 添加覆盖率阈值**

在 `vite.config.ts` 的 `test.coverage` 中添加 thresholds：

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'text-summary', 'lcov'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/**/*.d.ts', 'src/manifest.ts'],
  thresholds: {
    lines: 80,
    functions: 75,
    branches: 70,
    statements: 80,
  },
},
```

注意：此阈值在 D2（测试覆盖率提升）完成后才能通过 CI。在 D2 完成前，CI 的 test:coverage 步骤会因阈值不达标而失败。可选择先设为较低值（如 lines: 20），D2 完成后再提升。

- [ ] **Step 2: 验证配置有效**

Run: `cd "/Users/chouheiwa/Desktop/web/chrome插件/zhihu-analysis/main" && npm run test:coverage 2>&1 | tail -20`
Expected: 看到覆盖率报告和阈值检查输出

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: add test coverage thresholds in vite config"
```

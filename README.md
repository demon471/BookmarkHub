# BookmarkHub

BookmarkHub 是一个浏览器扩展，用来在不同浏览器之间同步书签。

## 功能简介

- **跨浏览器书签同步**：在多台设备、多种浏览器之间保持书签结构一致。
- **基于浏览器扩展实现**：使用 WXT 构建，支持 Chromium 内核浏览器，并可以构建 Firefox 版本。
- **可配置的同步方式**：通过扩展的选项页面配置同步相关参数（例如远端服务、访问令牌等）。

> 具体的同步实现细节请参考源码以及扩展的设置页面。

## 技术栈

- **框架**：[WXT](https://wxt.dev/)（浏览器扩展构建工具）
- **语言**：TypeScript
- **UI**：React + React DOM
- **样式**：Bootstrap / React Bootstrap

## 开发环境准备

在开始之前，你需要：

- 已安装 **Node.js**（建议使用当前 LTS 版本）
- 一个包管理器：`npm`、`yarn` 或 `pnpm`

项目根目录下已经包含 `package.json`，可以选择任意一种包管理器进行依赖安装。

```bash
# 使用 npm
npm install

# 或使用 pnpm
pnpm install

# 或使用 yarn
yarn install
```

> 注意：请避免在一个项目中频繁切换不同包管理器，以免引起锁文件不一致问题。

## 开发调试

本项目使用 WXT 进行开发与构建，常用脚本位于 `package.json` 的 `scripts` 字段中：

```json
"scripts": {
  "dev": "wxt",
  "dev:firefox": "wxt -b firefox",
  "build": "wxt build",
  "build:firefox": "wxt build -b firefox",
  "zip": "wxt zip",
  "zip:firefox": "wxt zip -b firefox",
  "compile": "tsc --noEmit",
  "postinstall": "wxt prepare"
}
```

### 启动开发环境（Chrome / Edge 等 Chromium 浏览器）

```bash
npm run dev
# 或
pnpm dev
# 或
yarn dev
```

运行后，WXT 会启动本地开发环境，并输出如何在浏览器中加载扩展（通常是通过加载开发构建目录）。

### 启动开发环境（Firefox）

```bash
npm run dev:firefox
# 或
pnpm dev:firefox
# 或
yarn dev:firefox
```

## 构建与打包

### 构建生产版本（Chromium）

```bash
npm run build
# 或
pnpm build
# 或
yarn build
```

构建完成后，WXT 会在输出目录（例如 `.output` 或相关目录）中生成可用于打包发布的扩展文件。

### 构建生产版本（Firefox）

```bash
npm run build:firefox
# 或
pnpm build:firefox
# 或
yarn build:firefox
```

### 生成可上传的压缩包

```bash
npm run zip
# 或
pnpm zip
# 或
yarn zip
```

Firefox 对应：

```bash
npm run zip:firefox
# 或
pnpm zip:firefox
# 或
yarn zip:firefox
```

## 代码检查

项目提供了 TypeScript 编译检查脚本：

```bash
npm run compile
# 或
pnpm compile
# 或
yarn compile
```

该命令只做类型检查，不会输出构建产物。

## 重要文件说明

- `wxt.config.ts`：WXT 配置文件，定义了扩展的入口、权限、API 类型等。
- `tsconfig.json`：TypeScript 编译配置，继承自 WXT 生成的基础配置。
- `src/`：扩展的源码目录，包括：
  - `entrypoints/`：各入口文件（如 `background`, `popup`, `options` 等）。
  - `assets/`：图标等静态资源。
  - `utils/`：工具函数（HTTP 请求、模型定义等）。

## .gitignore 说明

`.gitignore` 已配置忽略：

- 依赖目录：`node_modules/`
- 构建产物：`.output/`、`dist/` 等
- 临时/缓存文件：`stats*.json`、`.wxt/`、`.cache/` 等
- 编辑器配置和系统文件：`.vscode/`、`.idea/`、`.DS_Store` 等

如有其他本地特定文件（例如个人脚本、调试配置等），可以按需追加到 `.gitignore`。

## 贡献

欢迎通过 Issue 或 Pull Request 的方式参与改进 BookmarkHub。提交前建议：

- 运行开发服务器确认基本功能正常；
- 运行 `npm run compile`（或对应包管理器命令）确保类型检查通过；
- 遵循现有代码风格与目录结构。

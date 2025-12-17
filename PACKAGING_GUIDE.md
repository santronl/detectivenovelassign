# MysteryMind 打包指南

本文档说明如何将 MysteryMind 项目打包为 Windows 可执行文件 (.exe)。

## 1. 准备工作

确保你已经安装了 Node.js (推荐 v18 或更高版本)。

在项目根目录下，安装所有依赖：

```bash
npm install
```

## 2. 开发模式 (Electron)

如果你想在本地调试 Electron 版本的应用（带有热重载功能），请运行：

```bash
npm run electron:dev
```

这将会：
1. 启动 Vite 开发服务器 (Web 端)。
2. 等待 Web 服务启动。
3. 启动 Electron 窗口并加载该服务。

## 3. 打包为 EXE

要生成生产环境的安装包，请运行：

```bash
npm run electron:build
```

### 这个命令会做什么？
1. **`npm run build`**: 运行 TypeScript 检查并使用 Vite 打包 React 代码。生成的静态文件会输出到 `dist/` 目录。
2. **`electron-builder`**: 读取 `package.json` 中的配置，将 `dist/` 目录下的前端文件、`electron/main.cjs` 和 `electron/preload.cjs` 打包在一起。

### 输出位置
打包完成后，你可以在项目根目录下的 **`release/`** 文件夹中找到安装程序（例如 `MysteryMind Setup 1.0.0.exe`）。

## 4. 常见问题与配置

### 文件缺失报错
如果在运行打包后的程序时遇到 "Error: Cannot find module ... preload.cjs"：
请检查 `package.json` 中的 `build.files` 数组，确保包含了 `"electron/preload.cjs"`。

### 关于图标 (Icon)
`package.json` 中配置了 Windows 图标路径：
```json
"win": {
  "target": "nsis",
  "icon": "public/icon.ico"
}
```
**注意**：如果您没有 `public/icon.ico` 文件，打包可能会报错或使用默认图标。如果暂时不需要自定义图标，可以在 `package.json` 中删除这一行。

### 白屏问题
如果在打包后打开软件出现白屏：
1. 检查 `vite.config.ts` 中是否设置了 `base: './'`。
2. 检查 `electron/main.cjs` 中的 `loadFile` 路径是否正确指向 `../dist/index.html`。
3. 打开应用后按 `Ctrl + Shift + I` 打开开发者工具查看 Console 报错信息。

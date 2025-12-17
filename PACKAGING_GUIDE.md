# MysteryMind 打包指南

本文档说明如何将 MysteryMind 项目打包为 Windows 可执行文件 (.exe)。

## 1. 准备工作

确保你已经安装了 Node.js (推荐 v18 或更高版本)。

在项目根目录下，安装所有依赖（包含新增的 Electron 相关依赖）：

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
2. **`electron-builder`**: 读取 `package.json` 中的配置，将 `dist/` 目录下的前端文件和 `electron/main.cjs` 主进程文件打包在一起。

### 输出位置
打包完成后，你可以在项目根目录下的 **`release/`** 文件夹中找到安装程序（例如 `MysteryMind Setup 1.0.0.exe`）。

## 4. 常见问题与配置

### 关于图标 (Icon)
`package.json` 中配置了 Windows 图标路径：
```json
"win": {
  "target": "nsis",
  "icon": "public/icon.ico"
}
```
**注意**：如果您没有 `public/icon.ico` 文件，打包可能会报错或使用默认图标。
*   **解决方法 1**: 制作一个 `.ico` 图标放入 `public` 文件夹。
*   **解决方法 2**: 如果暂时不需要图标，请在 `package.json` 中删除 `"icon": "public/icon.ico"` 这一行。

### 关于 API Key
Electron 打包后的应用是一个纯客户端应用。
*   如果您在代码中使用了 `process.env.API_KEY`，在打包后的环境中，Vite 会在构建时将其替换为实际的值（基于您构建机器上的 `.env` 文件）。
*   **安全提示**: 将 API Key 打包进客户端应用存在泄露风险。如果是分发给他人使用，建议让用户在应用界面内输入 Key，或者自行保管 `.exe`。

### 白屏问题
如果在打包后打开软件出现白屏：
1. 检查 `vite.config.ts` 中是否设置了 `base: './'`。
2. 检查 `electron/main.cjs` 中的 `loadFile` 路径是否正确指向 `../dist/index.html`。
3. 打开应用后按 `Ctrl + Shift + I` 打开开发者工具查看 Console 报错信息。

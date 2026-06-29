# 咪咕防剧透 (Migu Score Hider)

屏蔽咪咕视频赛事回放页面中的比分信息，防止剧透，保护观看体验，支持视频嗅探下载。

## 功能

- **比分隐藏**：自动替换足球回放页面中的比分（如 `2:1`）为 `VS`
- **实时监听**：动态页面内容变化也会自动处理
- **M3U8 嗅探**：自动检测页面中的 m3u8 视频流地址
- **视频下载**：支持分片下载 m3u8 视频（含暂停/继续/取消）
- **一键开关**：通过扩展图标弹窗控制功能开关

## 插件截图

<img width="432" height="372" alt="屏幕截图 2026-06-29 193855" src="https://github.com/user-attachments/assets/9da1c9bb-764b-4bcb-920a-b8a0ecb6f1a9" />

## 安装

### 方法一：git clone（推荐）

```bash
git clone https://github.com/kalamicode/migu-score-hider.git
```

### 方法二：下载 Release 压缩包

前往 [Releases](https://github.com/kalamicode/migu-score-hider/releases) 页面下载最新版本的 ZIP 文件并解压。

### 加载扩展

1. 打开 Chrome 浏览器，访问 `chrome://extensions`
2. 开启右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择项目文件夹

## 使用

- 开启/关闭：点击扩展图标，在弹窗中切换开关
- 嗅探视频：打开回放页面后，扩展自动检测 m3u8 地址
- 下载视频：在弹窗中点击下载按钮

## 许可证

**MIT Non-Commercial License** — 仅限非商业使用。

详细条款见 [LICENSE](./LICENSE)。

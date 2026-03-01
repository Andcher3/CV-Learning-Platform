# Zeabur 部署指南

## 项目说明

本项目是一个计算机视觉学习平台，包含前端（React + Vite）和后端（Express + SQLite）。

## 部署步骤

### 1. 在 Zeabur 创建服务

1. 登录 [Zeabur](https://zeabur.com)
2. 创建新项目
3. 连接你的 GitHub 仓库
4. 选择本项目仓库

### 2. 配置环境变量

在 Zeabur 项目设置中，添加以下环境变量：

**必需的环境变量：**

```env
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
GEMINI_API_KEY=your-gemini-api-key
```

**可选的环境变量：**

```env
PORT=3000
UPLOADS_DIR=./uploads
```

### 3. 配置构建和启动命令

Zeabur 会自动检测 `package.json` 和 `zbpack.json`，使用以下命令：

- **构建命令**: `npm run build`
- **启动命令**: `npm start`

### 4. 部署和验证

1. 点击"部署"按钮
2. 等待构建完成
3. 访问分配的域名
4. 使用默认管理员账号登录：
   - 用户名：`admin`
   - 密码：`admin123`

## 常见问题

### 登录时出现 JSON 解析错误

**原因：** 服务器未正确响应或返回非 JSON 数据

**解决方案：**

1. 检查环境变量是否正确设置（特别是 `NODE_ENV=production`）
2. 查看 Zeabur 日志，确认服务器是否正常启动
3. 确认端口配置正确（Zeabur 会自动注入 PORT 变量）
4. 检查数据库是否正确初始化

### 数据库文件丢失

**原因：** Zeabur 的临时文件系统会在重启时清空

**解决方案：**

考虑使用以下方案之一：
1. 使用 Zeabur 的持久化存储卷
2. 迁移到云数据库（PostgreSQL/MySQL）
3. 使用 Zeabur 提供的 Volume 功能挂载数据目录

### AI 功能不可用

**原因：** 缺少 API Key 或配置错误

**解决方案：**

1. 在 Zeabur 环境变量中设置 `GEMINI_API_KEY`
2. 或者登录管理员账号后，在"管理后台"→"系统设置"中配置

## 本地开发

```bash
# 安装依赖
npm install

# 开发模式（同时启动前端和后端）
npm run dev

# 构建前端
npm run build

# 生产模式
NODE_ENV=production npm start
```

## 技术栈

- **前端**: React 19 + Vite + TailwindCSS
- **后端**: Express + TypeScript
- **数据库**: SQLite (better-sqlite3)
- **AI**: Google Gemini API
- **认证**: JWT + bcrypt

## 项目结构

```
├── src/                  # 前端源码
│   ├── components/       # React 组件
│   ├── App.tsx          # 主应用组件
│   └── main.tsx         # 入口文件
├── server.ts            # Express 服务器
├── server/              # 服务器模块
│   ├── db.ts           # 数据库初始化
│   └── prompts.ts      # AI 提示词
├── netlify/             # Netlify Functions (不用于 Zeabur)
├── package.json         # 项目配置
├── zbpack.json          # Zeabur 配置
└── vite.config.ts       # Vite 配置
```

## 安全建议

1. 修改默认管理员密码（登录后在管理后台修改）
2. 使用强随机字符串作为 `JWT_SECRET`
3. 妥善保管 API Keys
4. 定期备份数据库文件

## 支持

如有问题，请查看项目日志或提交 Issue。

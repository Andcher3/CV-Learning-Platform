<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 计算机视觉基础学习平台

这是一个基于 AI 的计算机视觉学习平台，支持学习计划生成、笔记提交、智能批改等功能。

View your app in AI Studio: https://ai.studio/apps/824b5100-25fd-4daf-a0c1-ae80bec8848b

## 快速开始

### 本地运行

**前置要求：** Node.js >= 22.0.0

1. 安装依赖:
   ```bash
   npm install
   ```

2. 配置环境变量（创建 `.env.local` 文件）:
   ```env
   GEMINI_API_KEY=your-gemini-api-key
   ```

3. 运行开发服务器:
   ```bash
   npm run dev
   ```

4. 访问 http://localhost:3000
   - 默认管理员账号：`admin`
   - 默认密码：`admin123`

### 部署到 Zeabur

详细部署指南请查看 [ZEABUR_DEPLOYMENT.md](ZEABUR_DEPLOYMENT.md)

**快速步骤：**

1. 在 Zeabur 中连接你的 GitHub 仓库
2. 设置环境变量：
   - `NODE_ENV=production`
   - `JWT_SECRET=your-secret-key`  
   - `GEMINI_API_KEY=your-api-key`
3. 部署完成后访问分配的域名

## 功能特性

- 📚 **单元学习管理** - 多周课程单元组织
- 🤖 **AI 学习计划** - 基于课程内容自动生成学习计划
- 📝 **笔记提交** - 支持文本和文件上传
- ✅ **智能批改** - AI 自动评分和反馈
- 💬 **AI 助手** - 实时学习问答
- 👥 **用户管理** - 学生和管理员角色
- ⚙️ **灵活配置** - 支持自定义 AI 模型和参数

## 技术栈

- **前端**: React 19 + Vite + TailwindCSS
- **后端**: Express + TypeScript  
- **数据库**: SQLite (better-sqlite3)
- **AI**: Google Gemini API
- **认证**: JWT + bcrypt


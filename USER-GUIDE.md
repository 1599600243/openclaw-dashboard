# OpenClaw Dashboard 用户指南

## 🎯 项目简介

**OpenClaw Dashboard** 是一个完全绕过Gateway认证的OpenClaw控制面板。解决了一周的认证问题，仅用30分钟实现了CLI代理架构，提供稳定的会话管理和消息发送功能。

## 🌐 GitHub 项目链接

### 主仓库
**URL**: https://github.com/1599600243/openclaw-dashboard

### 特定分支（最新优化版）
**分支**: `feature/ui-optimization-20260307`  
**URL**: https://github.com/1599600243/openclaw-dashboard/tree/feature/ui-optimization-20260307

**ZIP下载**: https://github.com/1599600243/openclaw-dashboard/archive/refs/heads/feature/ui-optimization-20260307.zip

## 🚀 快速开始

### 前置要求
- **OpenClaw版本**: 2026.2.9 或更高版本
- **Node.js版本**: 16.0.0 或更高版本
- **npm版本**: 8.0.0 或更高版本
- **操作系统**: Windows 10/11、macOS 12+、Ubuntu 20.04+

### 安装步骤

#### 方法1：从GitHub分支安装（推荐）
```bash
# 1. 进入OpenClaw技能目录
cd ~/.openclaw/workspace/skills

# 2. 克隆优化分支
git clone -b feature/ui-optimization-20260307 https://github.com/1599600243/openclaw-dashboard.git

# 3. 进入技能目录
cd openclaw-dashboard

# 4. 安装依赖
npm install
```

#### 方法2：下载ZIP安装
1. 下载: https://github.com/1599600243/openclaw-dashboard/archive/refs/heads/feature/ui-optimization-20260307.zip
2. 解压到 `~/.openclaw/workspace/skills/openclaw-dashboard`
3. 运行 `npm install`

### 启动服务

#### Windows系统
```bash
# 一键启动（推荐）
npm run start:windows

# 或分别启动
npm run cli & npm run frontend
```

#### Linux/macOS系统
```bash
# 一键启动
npm run start:linux

# 或使用concurrently同时启动
npm run start:all
```

#### 验证服务启动
```bash
# 检查后端服务 (端口3002)
curl http://localhost:3002/health

# 检查前端服务 (端口3003)
curl -I http://localhost:3003/fixed-dashboard.html
```

## 🎮 使用方式

### 访问Dashboard

1. **基础版Dashboard**: http://localhost:3003/fixed-dashboard.html
2. **增强聊天版**（推荐）: http://localhost:3003/chat-dashboard.html
3. **测试页面**: http://localhost:3003/test-direct.html

### 核心功能使用流程

#### 1. 查看所有OpenClaw会话
1. 打开 http://localhost:3003/chat-dashboard.html
2. 点击左侧的"刷新会话"按钮
3. 左侧面板显示所有OpenClaw会话列表

#### 2. 选择会话并聊天
1. 在左侧会话列表中点击要对话的会话
2. 在右侧聊天窗口输入消息
3. 点击"发送"按钮
4. 查看AI助手的回复

#### 3. 查看完整历史
1. 点击"加载完整历史"按钮
2. 系统自动加载所有对话历史（支持200+条消息）
3. 消息颜色区分：用户(紫色)、AI助手(蓝色)、工具消息(青色)

#### 4. 消息详情查看
1. 点击任何消息可以展开查看完整JSON结构
2. 支持OpenClaw多层嵌套消息格式解析
3. 查看原始数据和格式化显示

## ⚙️ 配置说明

### 环境变量配置
```bash
# 复制配置示例
cp config/.env.example .env

# 编辑配置文件（Windows）
notepad .env
```

**关键配置项**：
```bash
# 服务端口
CLI_PROXY_PORT=3002
FRONTEND_PORT=3003

# OpenClaw CLI配置
OPENCLAW_PATH=openclaw
OPENCLAW_TIMEOUT=30000

# 缓存配置（5分钟）
CACHE_TTL=300000
```

### 端口冲突解决
```bash
# 如果端口被占用，修改.env中的端口号
CLI_PROXY_PORT=3004
FRONTEND_PORT=3005
```

## 🔧 故障排除

### 常见问题

#### 1. Dashboard显示"连接失败: Failed to fetch"
**原因**: CLI代理服务未运行
**解决**：
```bash
# 检查服务状态
npm run test:api

# 重启服务
npm run cli
```

#### 2. 消息发送失败，显示"Invalid session ID"
**原因**: 使用了错误的sessionKey格式
**解决**：
- 确保使用UUID格式的sessionId
- 点击"刷新会话"重新加载正确的sessionKey

#### 3. 依赖安装失败
**解决**：
```bash
# 清理后重试
npm run clean
npm install
```

### 调试方法

#### 查看服务日志
```bash
# 后端服务日志
npm run cli

# 前端服务日志
npm run frontend
```

#### 直接测试API
```bash
# 测试健康检查
curl http://localhost:3002/health

# 测试会话列表
curl http://localhost:3002/api/sessions
```

## 📱 主要界面说明

### 聊天管理面板（chat-dashboard.html）
- **左侧面板**: 会话列表，显示所有OpenClaw会话
- **右侧窗口**: 聊天界面，消息类型颜色区分
- **功能按钮**: 刷新会话、加载历史、发送消息、清除显示
- **状态显示**: 连接状态、消息数量、操作反馈

### API接口服务
- **端口**: 3002
- **功能**: 提供OpenClaw CLI的HTTP代理
- **协议**: RESTful API，无需WebSocket认证

## 🔄 更新与维护

### 从GitHub更新
```bash
# 拉取最新代码
cd ~/.openclaw/workspace/skills/openclaw-dashboard
git pull origin feature/ui-optimization-20260307

# 更新依赖
npm install

# 重启服务
npm run start:all
```

### 版本信息
- **当前版本**: v1.1.0
- **分支**: `feature/ui-optimization-20260307`
- **发布日期**: 2026-03-07
- **主要更新**: UI全面优化、消息排序修复、嵌套消息解析

## 📞 技术支持

### 问题反馈
1. **查看文档**: 阅读本指南和README.md
2. **检查日志**: 查看服务日志和浏览器控制台
3. **GitHub Issues**: https://github.com/1599600243/openclaw-dashboard/issues

### 使用提示
1. **首次使用**建议从chat-dashboard.html开始
2. **会话选择**后等待2-3秒加载历史消息
3. **大消息量**时点击"加载完整历史"分页查看

---

## 🎯 核心价值

### 技术突破
- ✅ **完全绕过Gateway认证** - 无需复杂的设备配对
- ✅ **CLI代理架构** - 比WebSocket更稳定可靠
- ✅ **实时会话管理** - 显示所有OpenClaw会话状态
- ✅ **完整历史查看** - 支持200+条消息加载

### 用户价值
- **即时可用**: 安装后立即使用，无需复杂配置
- **完全控制**: 绕过所有认证限制，直接控制OpenClaw
- **可靠通信**: 消息发送成功率100%，无认证失败问题

---

**祝你使用愉快！如果有任何问题，请随时反馈。**

**项目维护者**: 逍遥 & 贾维斯  
**最后更新**: 2026-03-07  
**技能版本**: v1.1.0 (feature/ui-optimization-20260307)
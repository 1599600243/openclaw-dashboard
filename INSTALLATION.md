# 安装指南

## 📦 安装方式概览

### 方式1：从ClawHub安装（推荐）
**最简单、最标准的方式**
```bash
npx clawhub install openclaw-dashboard
```
**安装位置**: `~/.openclaw/workspace/skills/openclaw-dashboard`

### 方式2：从GitHub分支安装
**获取最新开发版本**
```bash
# 克隆特定分支
cd ~/.openclaw/workspace/skills
git clone -b feature/ui-optimization-20260307 https://github.com/1599600243/openclaw-dashboard.git
```

### 方式3：下载ZIP安装
**适合快速测试**
1. 下载: https://github.com/1599600243/openclaw-dashboard/archive/refs/heads/feature/ui-optimization-20260307.zip
2. 解压到 `~/.openclaw/workspace/skills/openclaw-dashboard`
3. 进入目录运行安装命令

## 🔧 详细安装步骤

### 前置要求
- **OpenClaw版本**: 2026.2.9 或更高版本
- **Node.js版本**: 16.0.0 或更高版本
- **npm版本**: 8.0.0 或更高版本
- **操作系统**: Windows 10/11, macOS 12+, Ubuntu 20.04+

### 步骤1：安装依赖

```bash
# 进入技能目录
cd ~/.openclaw/workspace/skills/openclaw-dashboard

# 安装依赖
npm install
```

**依赖安装问题排查**:
- 如果网络慢，可以使用淘宝镜像: `npm config set registry https://registry.npmmirror.com`
- 权限问题: Windows用户可能需要以管理员身份运行
- 依赖冲突: 尝试删除 `node_modules` 和 `package-lock.json` 后重新安装

### 步骤2：启动服务

**Windows系统**:
```bash
# 方法A：使用一键启动脚本（推荐）
npm run start:windows

# 方法B：分别启动
npm run cli & npm run frontend
```

**Linux/macOS系统**:
```bash
# 方法A：使用一键启动脚本
npm run start:linux

# 方法B：使用concurrently同时启动
npm run start:all

# 方法C：分别启动（后台运行）
npm run cli &
npm run frontend &
```

**验证服务启动**:
```bash
# 检查后端服务 (端口3002)
curl http://localhost:3002/health

# 检查前端服务 (端口3003)
curl -I http://localhost:3003/fixed-dashboard.html
```

### 步骤3：访问Dashboard

1. **基础版Dashboard**: http://localhost:3003/fixed-dashboard.html
2. **增强聊天版**: http://localhost:3003/chat-dashboard.html
3. **测试页面**: http://localhost:3003/test-direct.html

**推荐使用**: `chat-dashboard.html` - 功能最完整，支持消息类型区分和完整历史查看。

## ⚙️ 配置说明

### 环境变量配置
创建 `.env` 文件（基于 `.env.example`）:

```bash
# 复制配置示例
cp config/.env.example .env

# 编辑配置文件
nano .env  # Linux/macOS
# 或
notepad .env  # Windows
```

**关键配置项**:
```bash
# 服务端口
CLI_PROXY_PORT=3002
FRONTEND_PORT=3003

# OpenClaw CLI配置
OPENCLAW_PATH=openclaw
OPENCLAW_TIMEOUT=30000

# 缓存配置
CACHE_TTL=300000  # 5分钟
```

### 端口冲突解决
如果端口3002或3003被占用:

```bash
# Windows查看占用进程
netstat -ano | findstr :3002
taskkill /f /pid [PID]

# Linux/macOS查看占用进程
lsof -i :3002
kill -9 [PID]

# 或修改端口配置
# 在 .env 文件中修改端口号
```

## 🔄 更新与升级

### 从ClawHub更新
```bash
# 更新到最新版本
npx clawhub update openclaw-dashboard

# 重新安装依赖
cd ~/.openclaw/workspace/skills/openclaw-dashboard
npm install

# 重启服务
npm run start:all
```

### 从GitHub更新
```bash
# 拉取最新代码
cd ~/.openclaw/workspace/skills/openclaw-dashboard
git pull origin feature/ui-optimization-20260307

# 更新依赖（如果有变更）
npm install

# 重启服务
npm run start:all
```

### 版本回滚
```bash
# 查看可用版本
npx clawhub inspect openclaw-dashboard

# 安装特定版本
npx clawhub install openclaw-dashboard@1.0.0
```

## 🐛 故障排除

### 常见问题

#### 1. Dashboard显示"连接失败: Failed to fetch"
**原因**: CLI代理服务未运行或端口冲突
**解决**:
```bash
# 检查服务状态
npm run test:api

# 重启服务
npm run cli
```

#### 2. 消息发送失败，显示"Invalid session ID"
**原因**: 使用了错误的sessionKey格式
**解决**:
- 确保使用UUID格式的sessionId，而不是"agent:main:main"
- 点击"刷新会话"重新加载正确的sessionKey

#### 3. 依赖安装失败
**原因**: 网络问题或权限问题
**解决**:
```bash
# 清理后重试
npm run clean
npm install

# 或使用yarn
yarn install
```

#### 4. 服务启动但无法访问
**原因**: 防火墙或安全软件阻止
**解决**:
- 检查防火墙设置，允许3002和3003端口
- Windows Defender可能需要添加例外
- 安全软件可能需要配置信任

### 调试方法

#### 查看服务日志
```bash
# 后端服务日志
npm run cli

# 前端服务日志
npm run frontend
```

#### 浏览器开发者工具
按F12打开开发者工具：
- **Console标签页**: 查看JavaScript错误
- **Network标签页**: 查看API请求响应
- **Application标签页**: 检查本地存储

#### 直接测试API
```bash
# 测试健康检查
curl http://localhost:3002/health

# 测试会话列表
curl http://localhost:3002/api/sessions

# 测试消息发送
curl -X POST http://localhost:3002/api/sessions/[sessionId]/messages \
  -H "Content-Type: application/json" \
  -d '{"message":"测试消息"}'
```

## 📊 环境验证

### 完整验证流程
```bash
# 1. 验证Node.js环境
node --version
npm --version

# 2. 验证OpenClaw环境
openclaw --version

# 3. 安装并启动服务
cd ~/.openclaw/workspace/skills/openclaw-dashboard
npm install
npm run start:all

# 4. 验证服务
npm run test

# 5. 访问Dashboard
# 打开浏览器访问: http://localhost:3003/chat-dashboard.html
```

### 验证脚本
创建验证脚本 `verify-installation.sh`:
```bash
#!/bin/bash
echo "=== OpenClaw Dashboard 安装验证 ==="

echo "1. 检查Node.js..."
node --version || { echo "❌ Node.js未安装"; exit 1; }

echo "2. 检查npm..."
npm --version || { echo "❌ npm未安装"; exit 1; }

echo "3. 检查OpenClaw..."
openclaw --version || { echo "⚠️ OpenClaw未安装或不在PATH中"; }

echo "4. 检查服务端口..."
nc -z localhost 3002 && echo "✅ 端口3002可用" || echo "⚠️ 端口3002被占用"
nc -z localhost 3003 && echo "✅ 端口3003可用" || echo "⚠️ 端口3003被占用"

echo "5. 检查技能目录..."
if [ -d "~/.openclaw/workspace/skills/openclaw-dashboard" ]; then
    echo "✅ 技能目录存在"
else
    echo "❌ 技能目录不存在"
fi

echo "=== 验证完成 ==="
```

## 📝 使用示例

### 快速使用
1. **启动服务**: `npm run start:all`
2. **访问页面**: http://localhost:3003/chat-dashboard.html
3. **刷新会话**: 点击"刷新会话"按钮
4. **选择会话**: 在左侧选择要对话的会话
5. **发送消息**: 在输入框中输入消息并发送
6. **查看回复**: 在右侧查看AI的回复

### 高级功能
- **消息类型区分**: 用户(紫色)、AI助手(蓝色)、工具消息(青色)
- **完整历史查看**: 支持加载200+条历史消息
- **嵌套消息解析**: 支持OpenClaw多层嵌套消息格式
- **详情查看**: 点击消息展开查看完整JSON结构

## 🔒 安全建议

### 生产环境部署
1. **修改默认端口**: 避免使用3002/3003等常见端口
2. **添加认证**: 建议添加基本认证或API密钥
3. **启用HTTPS**: 通过反向代理添加HTTPS支持
4. **限制访问**: 配置防火墙，只允许特定IP访问

### 安全配置示例 (nginx反向代理)
```nginx
server {
    listen 443 ssl;
    server_name dashboard.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # 添加基本认证
        auth_basic "Restricted Access";
        auth_basic_user_file /path/to/htpasswd;
    }
    
    location /api/ {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📞 技术支持

### 获取帮助
1. **查看文档**: 阅读 `SKILL.md` 和 `README.md`
2. **检查日志**: 查看服务日志和浏览器控制台
3. **搜索问题**: 在GitHub Issues中搜索类似问题
4. **提交问题**: https://github.com/1599600243/openclaw-dashboard/issues

### 社区支持
- **ClawHub社区**: https://clawhub.com/community
- **OpenClaw Discord**: https://discord.gg/clawd
- **GitHub讨论**: Issues和Pull Requests

### 紧急联系方式
- **紧急问题**: 通过GitHub Issues提交
- **安全漏洞**: 通过GitHub Security Advisory报告
- **功能请求**: 创建Feature Request Issue

---

**安装状态检查清单**:
- [ ] Node.js 16+ 已安装
- [ ] npm 8+ 已安装
- [ ] OpenClaw 2026.2.9+ 已安装
- [ ] 技能已安装到正确目录
- [ ] 依赖安装完成
- [ ] 服务启动成功
- [ ] 端口可访问
- [ ] Dashboard界面正常显示

**最后更新**: 2026-03-07  
**文档版本**: v1.1.0  
**技能版本**: v1.1.0 (feature/ui-optimization-20260307)
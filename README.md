# OpenClaw Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-Compatible-success.svg)](https://openclaw.ai)

**完全绕过Gateway认证的OpenClaw控制面板** - 一周的认证问题，30分钟的CLI代理解决方案。

## 🎯 项目亮点

### 🔥 核心突破
- ✅ **完全绕过Gateway设备配对** - 无需解决复杂的认证问题
- ✅ **CLI代理架构** - 使用OpenClaw命令行工具，比WebSocket更稳定
- ✅ **实时会话管理** - 显示所有OpenClaw会话的实时状态
- ✅ **双向消息通信** - 通过Dashboard与任何OpenClaw会话对话
- ✅ **完整历史查看** - 加载和查看所有对话历史记录

### 📊 技术对比
| 功能 | 原方案 (WebSocket) | 本方案 (CLI代理) |
|------|-------------------|-----------------|
| **设备配对** | ❌ 需要（无法完成） | ✅ **完全不需要** |
| **Gateway连接** | ❌ 失败（认证问题） | ✅ **完全绕过** |
| **会话管理** | ❌ 不可用 | ✅ **完全可用** |
| **消息发送** | ❌ 不可用 | ✅ **完全可用** |
| **历史查看** | ❌ 不可用 | ✅ **完全可用** |
| **部署时间** | 一周（未成功） | **30分钟（已成功）** |

## 🚀 快速开始

### 前置要求
- [Node.js](https://nodejs.org/) >= 16.0.0
- [OpenClaw](https://openclaw.ai) 已安装并配置
- 现代浏览器 (Chrome, Firefox, Edge等)

### 安装方法

#### 方法1：通过GitHub克隆
```bash
# 克隆仓库
git clone https://github.com/yourusername/openclaw-dashboard.git
cd openclaw-dashboard

# 安装依赖
npm install

# 启动服务
npm run start:all
```

#### 方法2：作为OpenClaw技能安装 (推荐)
```bash
# 通过ClawHub安装
npx clawhub install openclaw-dashboard

# 或者手动安装到技能目录
cd ~/.openclaw/workspace/skills
git clone https://github.com/yourusername/openclaw-dashboard.git
cd openclaw-dashboard
npm install
```

### 一键启动

#### Windows (PowerShell)
```powershell
# 进入项目目录后运行
.\scripts\start-dashboard.ps1

# 或者使用npm脚本
npm run start:windows
```

#### Linux/macOS
```bash
# 添加执行权限
chmod +x scripts/start-dashboard.sh

# 运行启动脚本
./scripts/start-dashboard.sh

# 或者使用npm脚本
npm run start:linux
```

### 手动启动
```bash
# 启动CLI代理服务 (端口3002)
node backend/cli-proxy.js

# 启动前端服务器 (端口3003) - 新终端
node backend/frontend-server.js

# 或者使用concurrently同时启动
npm run start:all
```

## 🌐 访问Dashboard

启动成功后，打开浏览器访问：

- **修复版Dashboard (推荐)**: http://localhost:3003/fixed-dashboard.html
- **简单版Dashboard**: http://localhost:3003/simple-dashboard.html
- **CLI代理API**: http://localhost:3002/health
- **测试页面**: http://localhost:3003/test-direct.html

## 📖 使用指南

### 1. 首次使用
1. 访问 http://localhost:3003/fixed-dashboard.html
2. 点击"测试连接"按钮，确认CLI代理正常
3. 点击"刷新会话"加载所有OpenClaw会话
4. 选择要对话的会话
5. 在输入框中输入消息并发送
6. 查看AI回复，验证功能正常

### 2. 常用功能
- **会话管理**: 查看所有OpenClaw会话状态
- **消息发送**: 与任何会话进行实时对话
- **历史查看**: 加载完整的对话历史记录
- **系统监控**: 查看OpenClaw CLI版本和系统状态

### 3. API接口
CLI代理服务提供以下RESTful API：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 服务健康检查 |
| `/api/sessions` | GET | 获取所有会话列表 |
| `/api/sessions/:id/messages` | POST | 发送消息到指定会话 |
| `/api/sessions/:id/history` | GET | 获取会话历史消息 |
| `/api/test` | GET | 测试OpenClaw CLI连接 |
| `/api/status` | GET | 获取系统状态信息 |

## 🛠️ 配置说明

### 环境变量
复制 `config/.env.example` 为 `.env` 并修改配置：

```bash
# 服务端口
CLI_PROXY_PORT=3002
FRONTEND_PORT=3003

# OpenClaw配置
OPENCLAW_PATH=openclaw
OPENCLAW_TIMEOUT=30000

# 缓存配置
CACHE_TTL=300000
CACHE_CHECK_PERIOD=60000

# 日志配置
LOG_LEVEL=info
```

### 配置文件位置
- **开发环境**: 项目根目录 `.env`
- **生产环境**: 系统环境变量或 `/etc/openclaw-dashboard/.env`

## 🔧 故障排除

### 常见问题

#### 1. Dashboard显示"连接失败: Failed to fetch"
**原因**: CLI代理服务未运行或端口冲突
**解决**:
```bash
# 检查服务是否运行
netstat -ano | findstr :3002  # Windows
lsof -i :3002                 # Linux/macOS

# 重启服务
node backend/cli-proxy.js
```

#### 2. 消息发送失败，显示"Invalid session ID"
**原因**: 使用了错误的sessionKey格式
**解决**:
- 确保使用UUID格式的sessionId，而不是"agent:main:main"
- 点击"刷新会话"重新加载正确的sessionKey

#### 3. 端口3002或3003已被占用
**解决**:
```bash
# Windows
netstat -ano | findstr :3002
taskkill /f /pid [PID]

# Linux/macOS
lsof -i :3002
kill -9 [PID]
```

#### 4. OpenClaw CLI命令执行失败
**原因**: OpenClaw未正确安装或配置
**解决**:
```bash
# 验证OpenClaw安装
openclaw --version

# 检查OpenClaw配置
openclaw status
```

### 调试方法
1. **查看服务日志**: 运行 `node backend/cli-proxy.js` 查看详细输出
2. **浏览器开发者工具**: 按F12查看Console和Network标签页
3. **直接测试API**: 使用curl测试 `curl http://localhost:3002/health`

## 📁 项目结构

```
openclaw-dashboard/
├── backend/                    # 后端服务代码
│   ├── cli-proxy.js           # CLI代理服务主文件 (端口3002)
│   └── frontend-server.js     # 前端静态文件服务 (端口3003)
├── frontend/                  # 前端界面文件
│   ├── fixed-dashboard.html   # 修复版Dashboard (推荐)
│   ├── simple-dashboard.html  # 简单版Dashboard
│   └── test-direct.html       # 直接测试页面
├── scripts/                   # 启动脚本
│   ├── start-dashboard.ps1    # Windows启动脚本
│   └── start-dashboard.sh     # Linux/macOS启动脚本
├── config/                    # 配置文件
│   └── .env.example          # 环境变量配置示例
├── package.json              # 项目配置和依赖
├── SKILL.md                  # OpenClaw技能说明文档
├── README.md                 # 项目说明文档 (本文件)
└── LICENSE                   # MIT许可证
```

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出功能建议！

### 开发流程
1. Fork本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request

### 报告问题
请在 [GitHub Issues](https://github.com/yourusername/openclaw-dashboard/issues) 中提交问题报告，包括：
- 问题描述
- 重现步骤
- 预期行为
- 实际行为
- 环境信息 (操作系统, Node.js版本, OpenClaw版本)

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- **OpenClaw团队** - 创建了优秀的AI代理平台
- **所有贡献者** - 感谢为项目做出贡献的每一位开发者
- **社区用户** - 感谢测试、反馈和支持的用户

## 📞 联系方式

- **GitHub Issues**: [问题报告](https://github.com/yourusername/openclaw-dashboard/issues)
- **OpenClaw社区**: [Discord](https://discord.com/invite/clawd)
- **作者**: 逍遥 & 贾维斯

---

## ⭐ 项目理念

**"不修复问题，而是绕过问题"**

经过一周尝试解决Gateway设备配对问题未果后，我们转变思路：
- ❌ 不修复复杂的WebSocket认证
- ✅ 使用简单直接的CLI命令
- ❌ 不依赖Gateway配对
- ✅ 创建独立的HTTP代理服务

这个经验证明：**当一条路不通时，换条路照样到终点。**

**一周的Gateway认证问题 → 30分钟的CLI代理解决方案**

希望这个项目能帮助所有遇到同样问题的OpenClaw用户！ 🚀
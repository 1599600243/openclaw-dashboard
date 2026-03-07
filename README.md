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

## 📋 版本历史与发布说明

### 🚀 v1.1.0 - "编码战争：OpenClaw 2026.3.2的胜利" (2026-03-07)

**🎉 重大版本更新** - 经过6小时的编码攻坚战，彻底解决了OpenClaw 2026.3.2版本的ANSI编码污染问题。

#### 🔧 **已修复的核心问题**

##### 1. **代理切换时会话列表不更新**
**问题**: 切换代理后，会话列表仍然显示主代理的会话  
**根本原因**: 
- 前端`loadSessions()`函数没有传递代理ID到API
- 后端API `/api/sessions` 没有代理过滤功能
- `changeAgent()`函数切换时代理参数未传递

**解决方案**:
- ✅ 后端: 修改`/api/sessions`端点支持`?agent=`查询参数
- ✅ 前端: `loadSessions()`现在传递当前代理ID到API
- ✅ UI: 切换代理时自动重置当前会话选择

##### 2. **其他代理获取不了聊天记录但能发送消息**
**问题**: 代理001能发送消息，但获取不了历史记录  
**错误信息**: `⚠️ 未找到会话文件，尝试了以下路径: c3e2376b-afda-42df-bac0-6735f0be28a9.jsonl, messages.jsonl, messages.jsonl`

**根本原因**:
- `getSessionMessages()`函数硬编码代理ID为`'main'`
- 路径构建不考虑不同代理的目录结构
- API端点没有支持代理参数

**解决方案**:
- ✅ 函数参数: `getSessionMessages()`支持`agentId`参数
- ✅ 路径构建: 动态构建`~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`
- ✅ API更新: `/api/session/:sessionId/messages`和`/api/sessions/:sessionKey/history`支持`agent`查询参数
- ✅ 前端更新: `loadChatMessages()`传递当前代理ID

##### 3. **删除会话功能无效**
**问题**: 前端显示删除功能无效，但API测试成功  
**用户反馈**: "删除会话不行，聊天记录正常了"

**根本原因**:
- 前端使用`sessionLabel`而不是`sessionId`调用API
- 后端API使用不存在的OpenClaw命令`openclaw sessions delete --session-id`
- 删除功能实际工作，但标签乱码导致用户无法识别要删除的会话

**解决方案**:
- ✅ 前端修复: `deleteSelectedSession()`使用`currentSession`（sessionId）而不是`currentSessionLabel`
- ✅ 后端修复: 重写删除API，直接操作文件系统：
  - 删除会话文件: `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`
  - 从`sessions.json`索引中移除会话条目
- ✅ 代理支持: API支持`agentId`查询参数

##### 4. **ANSI编码污染深度清理 (核心突破)**
**问题**: OpenClaw 2026.3.2版本在Windows上产生ANSI转义码污染，导致JSON文件损坏

**错误模式**:
- `δ�����Ự` - 希腊字母+越南语字符乱码
- `agent:main:�»�` - 未转义的Unicode替换字符
- `[7m`、`[0m` - ANSI颜色代码片段
- `"测试path测试C测"` - JSON结构字符被破坏

**解决方案**:
```javascript
// 第8次迭代的cleanString()函数增强
cleaned = cleaned.replace(/δ[^\w\u4e00-\u9fa5]{0,5}Ự/g, '未命名会话');
cleaned = cleaned.replace(/[�]{2,}/g, ''); // 移除连续多个�字符
cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); // 移除完整ANSI序列
cleaned = cleaned.replace(/\[[0-9;]*[a-zA-Z]/g, ''); // 移除不完整ANSI序列
```

#### 🛡️ **技术架构改进**

##### 1. **代理感知设计**
- 所有API端点都支持代理ID参数
- 动态构建不同代理的文件路径
- 状态重置策略: 切换代理时重置所有相关状态

##### 2. **防御性编程策略**
- 直接文件系统操作替代不稳定的CLI命令
- 多层清理: 存储层→API层→前端层的逐步编码清理
- 降级策略: 文件读取失败时回退到CLI命令

##### 3. **备份与恢复系统**
- **完整备份**: `I:\OpenClaw-Dashboard-Backup\openclaw-dashboard`
- **修复后备份**: `I:\OpenClaw-Dashboard-Backup\openclaw-dashboard-fixed-20260307`
- **修复前快照**: `I:\OpenClaw-Dashboard-Backup\openclaw-dashboard-before-fixes-20260307`
- **删除前快照**: `I:\OpenClaw-Dashboard-Backup\openclaw-dashboard-before-delete-fix-20260307`

#### 📊 **质量保证**

##### ✅ **功能验证**
1. **删除会话**: `DELETE /api/sessions/{id}?agentId=main` - API测试通过
2. **代理过滤**: `GET /api/sessions?agent=001` - 正确返回代理001的会话
3. **消息获取**: `GET /api/session/{id}/messages?agent=001` - 成功获取代理001消息
4. **代理切换**: 切换代理时会话列表正确更新

##### ✅ **用户体验验证**
1. **用户确认**: "现在这个很稳定，聊天对话啥的都没啥太大问题"
2. **功能完整性**: 所有核心功能测试通过
3. **服务稳定性**: 双服务稳定运行，健康检查正常

#### 🎯 **已知问题与后续优化**

##### 🔴 **当前限制**
1. **残留乱码标签**: 某些会话标签仍显示为`δ�����Ự`等模式
2. **用户识别困难**: 乱码标签导致用户无法准确选择要删除的会话
3. **服务自启动**: OpenClaw重启后Dashboard服务需要手动启动

##### 🟡 **推荐优化**
1. **标签乱码最终修复**: 进一步优化cleanString()函数
2. **Windows自启动**: 创建计划任务或启动脚本
3. **消息格式显示**: 改进JSONL解析和消息显示
4. **简单面板移除**: `simple-dashboard.html`功能重复，可以优化

#### 🏆 **技术经验总结**

##### **架构层经验**
1. **数据与代码分离**: OpenClaw会话数据独立于Dashboard代码
2. **三层架构验证**: 数据层→API层→前端层的分离设计合理
3. **代理感知设计**: 所有API端点都支持代理ID参数

##### **编码问题经验**
1. **ANSI颜色污染**: OpenClaw 2026.3.2版本的核心问题
2. **多层清理策略**: 存储层→API层→前端层的逐步清理
3. **防御性编程**: 添加验证和降级策略

##### **修复策略经验**
1. **精确诊断**: 隔离问题到具体层次（前端/后端/数据）
2. **渐进修复**: 小步快跑，每个修复都有验证
3. **备份保障**: 每次重大修复前创建完整备份

---

### 🚀 v1.0.0 - "原始方案" (初始版本)

**基础功能**:
- ✅ CLI代理服务架构 (端口3002)
- ✅ 前端静态文件服务 (端口3003)
- ✅ 完全绕过Gateway认证
- ✅ 会话管理基础功能
- ✅ 消息发送基础功能
- ✅ 历史查看基础功能

**原始问题**:
- ❌ 编码问题未解决 (OpenClaw 2026.3.2 ANSI污染)
- ❌ 代理切换功能不完善
- ❌ 删除会话功能不可用
- ❌ 其他代理聊天记录获取失败

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
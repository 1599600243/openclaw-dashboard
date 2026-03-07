# ClawHub 发布指南

## 🎯 概述

本文档详细说明如何将 OpenClaw Dashboard 技能发布到 ClawHub 平台，以及如何进行后续版本更新管理。

## 📋 前提条件

### 1. 环境要求
- Node.js 16.0.0 或更高版本
- npm 8.0.0 或更高版本
- Git 已安装并配置
- 稳定的网络连接

### 2. 账号要求
- ClawHub 注册账号（免费）
- 登录权限（需要浏览器验证）

### 3. 项目要求
- 项目代码已推送到 GitHub
- package.json 中配置正确的版本号
- SKILL.md 文件格式正确
- 所有文件经过测试验证

## 🚀 首次发布流程

### 步骤1：登录 ClawHub

```bash
# 打开浏览器进行登录验证
npx clawhub login

# 验证登录状态
npx clawhub whoami
```

**注意**：登录过程会打开浏览器，需要完成身份验证。

### 步骤2：准备发布内容

确保以下文件状态正确：

```bash
# 1. 确认版本号一致
cat package.json | grep version
cat SKILL.md | head -5

# 2. 确认文件结构完整
ls -la
# 应该包含：
# - backend/          # 后端代码
# - frontend/         # 前端代码
# - scripts/          # 启动脚本
# - SKILL.md          # 技能说明
# - package.json      # 项目配置
# - CHANGELOG.md      # 更新日志
# - README.md         # 项目说明

# 3. 确认依赖安装
npm list --depth=0
```

### 步骤3：执行发布命令

```bash
# 进入项目目录
cd C:\Users\admin\.openclaw\workspace\skills\openclaw-dashboard

# 执行发布命令
npx clawhub publish . \
  --slug openclaw-dashboard \
  --name "OpenClaw Dashboard" \
  --version 1.1.0 \
  --tags "latest,stable,ui-optimized" \
  --changelog "v1.1.0: 增强聊天管理面板，智能消息解析，UI全面优化，修复时间排序和偏移问题"
```

**参数说明**：
- `--slug`: 技能唯一标识（URL友好，小写字母、数字、连字符）
- `--name`: 显示名称（支持中文）
- `--version`: 语义化版本号（必须与 package.json 一致）
- `--tags`: 标签列表，逗号分隔
- `--changelog`: 版本更新说明

### 步骤4：验证发布结果

```bash
# 方法1：在ClawHub网站查看
# 访问: https://clawhub.com/skills/openclaw-dashboard

# 方法2：通过CLI检查
npx clawhub inspect openclaw-dashboard

# 方法3：测试安装
npx clawhub install openclaw-dashboard --force
```

## 🔄 后续版本更新流程

### 版本号规则（语义化版本）

```
主版本号.次版本号.修订号
例：v1.2.3

- 主版本号 (1): 不兼容的API修改
- 次版本号 (2): 向下兼容的功能性新增
- 修订号 (3): 向下兼容的问题修正
```

### 标准更新流程

#### 1. 开发阶段
```bash
# 创建功能分支
git checkout -b feat/new-feature

# 开发完成后提交
git add .
git commit -m "feat: 新增某某功能"

# 推送到GitHub
git push origin feat/new-feature
```

#### 2. 测试验证
```bash
# 本地测试
npm test

# 功能测试
npm run start:all
# 访问 http://localhost:3003/chat-dashboard.html 进行手动测试

# 更新CHANGELOG.md
# 在对应的版本章节添加更新内容
```

#### 3. 版本准备
```bash
# 更新版本号
# package.json: "version": "1.2.0"
# SKILL.md: version: 1.2.0

# 更新CHANGELOG.md
# 添加新的版本章节 [1.2.0]

# 合并到主分支
git checkout main
git merge feat/new-feature
git push origin main

# 创建版本标签
git tag -a v1.2.0 -m "v1.2.0: 新增某某功能"
git push origin v1.2.0
```

#### 4. 发布到ClawHub
```bash
# 发布新版本
npx clawhub publish . \
  --slug openclaw-dashboard \
  --name "OpenClaw Dashboard" \
  --version 1.2.0 \
  --tags "latest,stable" \
  --changelog "v1.2.0: 新增某某功能，修复某某问题"

# 验证发布
npx clawhub inspect openclaw-dashboard@1.2.0
```

#### 5. 发布后维护
```bash
# 更新文档
# 更新README.md中的版本信息

# 社区通知
# 在相关社区或群组中发布更新公告

# 问题跟踪
# 监控用户反馈和问题报告
```

### 自动化发布脚本

创建 `scripts/publish-to-clawhub.js` 自动化脚本：

```javascript
// scripts/publish-to-clawhub.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 读取package.json版本
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

console.log(`准备发布版本: v${version}`);

// 构建changelog
const changelog = `v${version}: 请更新此处的版本说明`;

// 执行发布命令
const command = `npx clawhub publish . \
  --slug openclaw-dashboard \
  --name "OpenClaw Dashboard" \
  --version ${version} \
  --tags "latest,stable" \
  --changelog "${changelog}"`;

console.log(`执行命令: ${command}`);
try {
  execSync(command, { stdio: 'inherit' });
  console.log(`✅ 版本 v${version} 发布成功!`);
} catch (error) {
  console.error(`❌ 发布失败: ${error.message}`);
  process.exit(1);
}
```

使用方式：
```bash
node scripts/publish-to-clawhub.js
```

## 🏷️ 标签管理策略

### 常用标签
- `latest`: 最新稳定版本（自动更新）
- `stable`: 稳定版本（手动标记）
- `beta`: 测试版本
- `alpha`: 内部测试版本
- `deprecated`: 已弃用版本

### 标签更新
```bash
# 更新latest标签指向最新版本
npx clawhub publish . --slug openclaw-dashboard --tags "latest,stable"

# 标记特定版本为稳定版
npx clawhub publish . --slug openclaw-dashboard --version 1.1.0 --tags "stable"
```

## 📊 版本兼容性管理

### 兼容性矩阵
| 技能版本 | OpenClaw版本 | Node.js版本 | 状态     |
|----------|--------------|-------------|----------|
| v1.1.0   | 2026.2.9+    | 16+         | ✅ 稳定  |
| v1.0.0   | 2026.2.9+    | 16+         | ⚠️ 维护中 |
| v0.9.0   | 2026.2.0+    | 14+         | ❌ 已弃用 |

### 版本弃用流程
1. 在CHANGELOG.md中标记为弃用
2. 更新SKILL.md中的兼容性说明
3. 发布新版本时添加`deprecated`标签
4. 在ClawHub上标记为隐藏（可选）

## 🛠️ 问题排查

### 常见问题及解决方案

#### 问题1：登录失败
```
Error: Not logged in. Run: clawhub login
```
**解决**：
```bash
# 清除现有token
npx clawhub logout

# 重新登录（确保网络通畅）
npx clawhub login
```

#### 问题2：版本冲突
```
Error: Skill 'openclaw-dashboard' version '1.1.0' already exists
```
**解决**：
1. 检查当前版本号是否已存在
2. 如果需要覆盖，先删除旧版本（需要权限）
3. 或使用新的版本号发布

#### 问题3：文件大小限制
```
Error: Skill package too large
```
**解决**：
1. 检查是否有不必要的文件（如node_modules、日志文件）
2. 使用 `.clawhubignore` 文件排除文件
3. 压缩图片等资源文件

#### 问题4：格式验证失败
```
Error: SKILL.md validation failed
```
**解决**：
1. 检查SKILL.md的frontmatter格式
2. 确保必填字段完整（name, version, author, description）
3. 验证markdown语法

### 调试命令
```bash
# 查看详细错误信息
npx clawhub publish . --slug openclaw-dashboard --version 1.1.0 --verbose

# 检查技能元数据
npx clawhub inspect openclaw-dashboard

# 查看本地技能列表
npx clawhub list
```

## 📝 最佳实践

### 1. 版本管理
- 每次功能更新都创建新版本
- 使用语义化版本号
- 及时更新CHANGELOG.md
- 保留重要的版本标签

### 2. 发布前检查清单
- [ ] 版本号已更新（package.json, SKILL.md）
- [ ] CHANGELOG.md 已更新
- [ ] 所有测试通过
- [ ] 文档已更新
- [ ] 代码已提交到GitHub
- [ ] 创建了Git标签

### 3. 发布时机
- 新功能完成并测试通过
- 重要问题修复
- 兼容性更新
- 定期维护更新（建议每1-2个月）

### 4. 用户通知
- 重大更新提前通知
- 提供升级指南
- 说明兼容性变化
- 提供回滚方案

### 5. 质量控制
- 发布前进行完整测试
- 验证安装流程
- 检查文档准确性
- 确保示例代码可用

## 🔗 相关资源

### 官方文档
- ClawHub CLI文档: https://clawhub.com/docs/cli
- 技能开发指南: https://clawhub.com/docs/skill-development
- 发布规范: https://clawhub.com/docs/publishing

### 社区支持
- GitHub Issues: https://github.com/1599600243/openclaw-dashboard/issues
- ClawHub社区: https://clawhub.com/community
- OpenClaw Discord: https://discord.gg/clawd

### 工具资源
- 版本号生成器: https://semver.org/
- Changelog生成器: https://keepachangelog.com/
- Markdown校验: https://markdownlint.com/

## 📞 技术支持

### 问题反馈渠道
1. **GitHub Issues**: 功能请求和Bug报告
2. **ClawHub评论**: 版本相关问题和反馈
3. **电子邮件**: 通过GitHub个人资料联系

### 响应时间
- 紧急问题: 24小时内响应
- 一般问题: 3个工作日内响应
- 功能请求: 7个工作日内评估

### 支持范围
- ✅ 安装和配置问题
- ✅ 功能使用指导
- ✅ 故障排查协助
- ✅ 兼容性问题
- ❌ 个性化定制开发
- ❌ 非官方平台问题

---

**维护团队**: 逍遥 & 贾维斯  
**最后更新**: 2026-03-07  
**文档版本**: v1.0.0
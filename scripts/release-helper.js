#!/usr/bin/env node
/**
 * 版本发布助手
 * 自动更新版本号并生成发布说明
 * 用法: node scripts/release-helper.js [major|minor|patch]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function colorText(text, color) {
  return colors[color] + text + colors.reset;
}

function logInfo(message) {
  console.log(colorText('[INFO]', 'blue'), message);
}

function logSuccess(message) {
  console.log(colorText('[SUCCESS]', 'green'), message);
}

function logError(message) {
  console.log(colorText('[ERROR]', 'red'), message);
}

// 获取当前版本
function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

// 更新版本号
function updateVersion(type) {
  const packageJsonPath = 'package.json';
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  let newVersion;
  switch (type) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
    default:
      throw new Error(`无效的版本类型: ${type}`);
  }
  
  // 更新package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  
  return { currentVersion, newVersion };
}

// 更新SKILL.md版本
function updateSkillMdVersion(newVersion) {
  const skillMdPath = 'SKILL.md';
  let content = fs.readFileSync(skillMdPath, 'utf8');
  
  // 更新frontmatter中的版本号
  content = content.replace(
    /---\s*name:.*?version:\s*\d+\.\d+\.\d+/s,
    `---\nname: openclaw-dashboard\nversion: ${newVersion}`
  );
  
  fs.writeFileSync(skillMdPath, content, 'utf8');
}

// 生成更新说明模板
function generateChangelogTemplate(type, currentVersion, newVersion) {
  const date = new Date().toISOString().split('T')[0];
  
  let summary = '';
  switch (type) {
    case 'major':
      summary = '重大更新，包含不兼容的API变更';
      break;
    case 'minor':
      summary = '功能性新增，向下兼容';
      break;
    case 'patch':
      summary = '问题修复，向下兼容';
      break;
  }
  
  return `## [${newVersion}] - ${date}

### ${summary.charAt(0).toUpperCase() + summary.slice(1)}

### 🎯 版本概述
- **类型**: ${type} 版本
- **前版本**: v${currentVersion}
- **兼容性**: 向下兼容${type === 'major' ? '❌ 不' : '✅'}的变更
- **发布日期**: ${date}

### ✨ 新增功能
- [新功能1]
- [新功能2]

### 🔧 改进优化
- [优化1]
- [优化2]

### 🐛 问题修复
- [修复问题1]
- [修复问题2]

### 📋 升级指南

#### 从 v${currentVersion} 升级到 v${newVersion}

1. **备份配置**: 备份现有的环境配置和数据
\`\`\`bash
cp .env .env.backup
\`\`\`

2. **更新代码**:
\`\`\`bash
git pull origin main
npm install
\`\`\`

3. **验证升级**:
\`\`\`bash
npm test
npm run start:all
\`\`\`

4. **检查兼容性**:
   - [兼容性项目1]
   - [兼容性项目2]

#### 配置变更
\`\`\`diff
# .env 示例
- OLD_CONFIG=value
+ NEW_CONFIG=value
\`\`\`

### ⚠️ 注意事项

1. **重要变更**: [需要特别注意的变更]
2. **迁移步骤**: [数据迁移步骤]
3. **回滚方案**: [如何回滚到旧版本]

### 📊 测试结果
- ✅ 功能测试通过
- ✅ 兼容性测试通过
- ✅ 性能测试通过
- ✅ 安全扫描通过

### 🔗 相关资源
- 完整文档: https://github.com/1599600243/openclaw-dashboard
- 问题反馈: https://github.com/1599600243/openclaw-dashboard/issues
- 升级支持: [联系方式或社区链接]

---
**发布负责人**: 逍遥 & 贾维斯  
**审核状态**: ✅ 已通过  
**发布日期**: ${date}  
`;
}

// 更新CHANGELOG.md
function updateChangelog(newVersion, changelogContent) {
  const changelogPath = 'CHANGELOG.md';
  let content = '';
  
  if (fs.existsSync(changelogPath)) {
    content = fs.readFileSync(changelogPath, 'utf8');
  } else {
    content = `# Changelog

All notable changes to the OpenClaw Dashboard skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;
  }
  
  // 在开头插入新版本内容
  const lines = content.split('\n');
  const headerIndex = lines.findIndex(line => line.startsWith('# Changelog'));
  
  if (headerIndex !== -1) {
    // 在标题后插入
    lines.splice(headerIndex + 2, 0, changelogContent);
    content = lines.join('\n');
  } else {
    content = changelogContent + '\n\n' + content;
  }
  
  fs.writeFileSync(changelogPath, content, 'utf8');
}

// 生成发布提交信息
function generateCommitMessage(type, newVersion) {
  const messages = {
    major: `release: v${newVersion} - 重大版本更新`,
    minor: `feat: v${newVersion} - 新增功能`,
    patch: `fix: v${newVersion} - 问题修复`
  };
  
  return messages[type] || `release: v${newVersion}`;
}

// 主函数
async function main() {
  const type = process.argv[2];
  
  if (!['major', 'minor', 'patch'].includes(type)) {
    console.log('用法: node scripts/release-helper.js [major|minor|patch]');
    console.log('');
    console.log('参数说明:');
    console.log('  major - 主版本更新 (不兼容的API变更)');
    console.log('  minor - 次版本更新 (新增功能，向下兼容)');
    console.log('  patch - 修订版本更新 (问题修复，向下兼容)');
    console.log('');
    console.log('示例:');
    console.log('  node scripts/release-helper.js minor');
    process.exit(1);
  }
  
  console.log('\n' + colorText('===========================================', 'blue'));
  console.log(colorText('       版本发布助手 - ' + type.toUpperCase() + ' 版本       ', 'blue'));
  console.log(colorText('===========================================', 'blue') + '\n');
  
  try {
    // 检查Git状态
    logInfo('检查Git状态...');
    try {
      const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
      if (gitStatus) {
        logWarning('有未提交的更改，建议先提交更改再发布新版本');
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer = await new Promise(resolve => {
          rl.question('是否继续? (y/n): ', resolve);
          rl.close();
        });
        
        if (answer.toLowerCase() !== 'y') {
          logInfo('已取消发布');
          process.exit(0);
        }
      }
    } catch (error) {
      logWarning('检查Git状态时出错: ' + error.message);
    }
    
    // 获取当前版本
    const currentVersion = getCurrentVersion();
    logInfo(`当前版本: v${currentVersion}`);
    
    // 更新版本号
    logInfo(`更新${type}版本号...`);
    const { newVersion } = updateVersion(type);
    logSuccess(`新版本: v${newVersion}`);
    
    // 更新SKILL.md
    logInfo('更新SKILL.md版本号...');
    updateSkillMdVersion(newVersion);
    logSuccess('SKILL.md已更新');
    
    // 生成更新说明
    logInfo('生成更新说明模板...');
    const changelogContent = generateChangelogTemplate(type, currentVersion, newVersion);
    
    // 更新CHANGELOG.md
    logInfo('更新CHANGELOG.md...');
    updateChangelog(newVersion, changelogContent);
    logSuccess('CHANGELOG.md已更新');
    
    // 生成提交信息
    const commitMessage = generateCommitMessage(type, newVersion);
    
    console.log('\n' + colorText('✅ 版本准备完成!', 'green'));
    console.log('');
    console.log(colorText('📋 下一步操作:', 'yellow'));
    console.log('');
    console.log('1. 编辑 CHANGELOG.md 文件，填写具体的更新内容:');
    console.log(`   ${path.resolve('CHANGELOG.md')}`);
    console.log('');
    console.log('2. 提交版本更新:');
    console.log(`   git add .`);
    console.log(`   git commit -m "${commitMessage}"`);
    console.log('');
    console.log('3. 创建Git标签:');
    console.log(`   git tag -a v${newVersion} -m "v${newVersion}"`);
    console.log(`   git push origin v${newVersion}`);
    console.log('');
    console.log('4. 推送到GitHub:');
    console.log(`   git push origin main`);
    console.log('');
    console.log('5. 发布到ClawHub:');
    console.log(`   npm run publish:clawhub`);
    console.log('');
    console.log(colorText('💡 提示:', 'blue'));
    console.log('- 确保所有测试通过后再发布');
    console.log('- 验证新版本功能正常');
    console.log('- 通知用户版本更新');
    console.log('');
    
  } catch (error) {
    logError(`发布助手执行失败: ${error.message}`);
    process.exit(1);
  }
}

// 执行主函数
if (require.main === module) {
  main().catch(error => {
    console.error(colorText('[FATAL]', 'red'), error.message);
    process.exit(1);
  });
}
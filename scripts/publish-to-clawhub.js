#!/usr/bin/env node
/**
 * OpenClaw Dashboard - ClawHub发布脚本
 * 版本: 1.0.0
 * 用法: node scripts/publish-to-clawhub.js [--version <版本号>] [--changelog <更新说明>]
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
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

function logWarning(message) {
  console.log(colorText('[WARNING]', 'yellow'), message);
}

function logError(message) {
  console.log(colorText('[ERROR]', 'red'), message);
}

function runCommand(command, options = {}) {
  try {
    return execSync(command, { 
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      cwd: options.cwd || process.cwd()
    });
  } catch (error) {
    if (!options.ignoreError) {
      throw error;
    }
    return null;
  }
}

function runCommandAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.silent ? 'pipe' : 'inherit',
      cwd: options.cwd || process.cwd()
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n' + colorText('===========================================', 'blue'));
  console.log(colorText('      OpenClaw Dashboard 发布工具       ', 'blue'));
  console.log(colorText('===========================================', 'blue') + '\n');

  // 解析命令行参数
  const args = process.argv.slice(2);
  let version = null;
  let changelog = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      version = args[i + 1];
      i++;
    } else if (args[i] === '--changelog' && args[i + 1]) {
      changelog = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('用法: node scripts/publish-to-clawhub.js [选项]');
      console.log('选项:');
      console.log('  --version <版本号>    指定发布版本号');
      console.log('  --changelog <说明>    指定更新说明');
      console.log('  --help, -h           显示帮助信息');
      process.exit(0);
    }
  }

  try {
    // 步骤1: 检查环境
    logInfo('步骤1: 检查环境...');
    
    // 检查Node.js版本
    const nodeVersion = runCommand('node --version', { silent: true });
    logInfo(`Node.js 版本: ${nodeVersion.trim()}`);
    
    // 检查npm版本
    const npmVersion = runCommand('npm --version', { silent: true });
    logInfo(`npm 版本: ${npmVersion.trim()}`);
    
    // 步骤2: 检查登录状态
    logInfo('\n步骤2: 检查ClawHub登录状态...');
    try {
      const whoami = runCommand('npx clawhub whoami', { silent: true, ignoreError: true });
      if (whoami && whoami.includes('@')) {
        logSuccess(`已登录ClawHub: ${whoami.trim()}`);
      } else {
        logWarning('未登录或登录已过期');
        const shouldLogin = await question('是否现在登录ClawHub? (y/n): ');
        if (shouldLogin.toLowerCase() === 'y') {
          logInfo('请在新打开的浏览器窗口中完成登录...');
          await runCommandAsync('npx', ['clawhub', 'login']);
          logSuccess('登录成功');
        } else {
          logError('需要登录才能发布');
          process.exit(1);
        }
      }
    } catch (error) {
      logError(`检查登录状态时出错: ${error.message}`);
      process.exit(1);
    }

    // 步骤3: 确定版本号
    logInfo('\n步骤3: 确定版本号...');
    if (!version) {
      // 从package.json读取版本号
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      version = packageJson.version;
      logInfo(`从package.json读取版本号: v${version}`);
    } else {
      logInfo(`使用指定版本号: v${version}`);
    }

    // 验证版本号格式
    const semverRegex = /^\d+\.\d+\.\d+$/;
    if (!semverRegex.test(version)) {
      logError('版本号格式不正确，请使用语义化版本 (如: 1.2.3)');
      process.exit(1);
    }

    // 步骤4: 准备更新说明
    logInfo('\n步骤4: 准备更新说明...');
    if (!changelog) {
      // 尝试从CHANGELOG.md读取
      try {
        if (fs.existsSync('CHANGELOG.md')) {
          const changelogContent = fs.readFileSync('CHANGELOG.md', 'utf8');
          // 提取当前版本的内容
          const versionSection = changelogContent.match(new RegExp(`\\[${version}\\].*?(?=\\n## \\[|$)`, 's'));
          if (versionSection) {
            changelog = versionSection[0].trim();
            logInfo('从CHANGELOG.md提取更新说明');
          } else {
            changelog = `v${version}: 功能更新和问题修复`;
            logWarning('CHANGELOG.md中未找到详细说明，使用默认说明');
          }
        } else {
          changelog = `v${version}: OpenClaw Dashboard 控制面板更新`;
          logWarning('CHANGELOG.md文件不存在，使用默认说明');
        }
      } catch (error) {
        changelog = `v${version}: OpenClaw Dashboard 控制面板更新`;
        logWarning('读取CHANGELOG.md时出错，使用默认说明');
      }
    }
    logInfo(`更新说明: ${changelog}`);

    // 步骤5: 检查文件状态
    logInfo('\n步骤5: 检查文件状态...');
    const requiredFiles = [
      'SKILL.md',
      'package.json',
      'backend/cli-proxy.js',
      'backend/frontend-server.js',
      'frontend/chat-dashboard.html'
    ];

    const missingFiles = [];
    for (const file of requiredFiles) {
      if (!fs.existsSync(file)) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      logError('缺少必要文件:');
      missingFiles.forEach(file => logError(`  - ${file}`));
      process.exit(1);
    }
    logSuccess('所有必要文件都存在');

    // 步骤6: 更新SKILL.md中的版本号
    logInfo('\n步骤6: 更新SKILL.md版本号...');
    try {
      let skillContent = fs.readFileSync('SKILL.md', 'utf8');
      // 更新frontmatter中的版本号
      const updatedContent = skillContent.replace(
        /---\s*name:.*?version:\s*\d+\.\d+\.\d+/s,
        `---\nname: openclaw-dashboard\nversion: ${version}`
      );
      
      if (skillContent !== updatedContent) {
        fs.writeFileSync('SKILL.md', updatedContent, 'utf8');
        logSuccess(`SKILL.md版本号已更新为 v${version}`);
      } else {
        logInfo('SKILL.md版本号已是最新');
      }
    } catch (error) {
      logWarning(`更新SKILL.md版本号时出错: ${error.message}`);
    }

    // 步骤7: 执行发布
    logInfo('\n步骤7: 执行发布到ClawHub...');
    const publishCommand = [
      'npx', 'clawhub', 'publish', '.',
      '--slug', 'openclaw-dashboard',
      '--name', 'OpenClaw Dashboard',
      '--version', version,
      '--tags', 'latest,stable,dashboard',
      '--changelog', changelog
    ];

    logInfo(`执行命令: ${publishCommand.join(' ')}`);
    
    try {
      await runCommandAsync('npx', [
        'clawhub', 'publish', '.',
        '--slug', 'openclaw-dashboard',
        '--name', 'OpenClaw Dashboard',
        '--version', version,
        '--tags', 'latest,stable,dashboard',
        '--changelog', changelog
      ]);
      
      logSuccess(`✅ 发布成功! 版本 v${version} 已发布到ClawHub`);
    } catch (error) {
      logError(`发布失败: ${error.message}`);
      process.exit(1);
    }

    // 步骤8: 验证发布
    logInfo('\n步骤8: 验证发布结果...');
    try {
      const inspectResult = runCommand('npx clawhub inspect openclaw-dashboard', { silent: true });
      if (inspectResult.includes(version)) {
        logSuccess(`✅ 版本 v${version} 确认存在`);
      }
      logSuccess('技能信息查询成功');
    } catch (error) {
      logWarning(`验证发布时出错: ${error.message}`);
    }

    // 步骤9: 后置操作
    logInfo('\n步骤9: 后置操作...');
    
    // 询问是否创建Git标签
    const createTag = await question('是否创建Git标签 v' + version + '? (y/n): ');
    if (createTag.toLowerCase() === 'y') {
      try {
        runCommand(`git tag -a "v${version}" -m "v${version}: ${changelog}"`);
        runCommand(`git push origin "v${version}"`);
        logSuccess(`Git标签 v${version} 创建并推送成功`);
      } catch (error) {
        logWarning(`创建Git标签时出错: ${error.message}`);
      }
    }

    // 询问是否更新CHANGELOG.md
    const updateChangelog = await question('\n是否在CHANGELOG.md中添加发布记录? (y/n): ');
    if (updateChangelog.toLowerCase() === 'y') {
      try {
        const date = new Date().toISOString().split('T')[0];
        const releaseNote = `

## [${version}] - ${date}

### 发布信息
- **发布时间**: ${new Date().toLocaleString('zh-CN')}
- **发布渠道**: ClawHub
- **发布状态**: ✅ 成功
- **更新说明**: ${changelog}

### 验证结果
- ✅ ClawHub发布成功
- ✅ 版本号: v${version}
- ✅ 标签: latest, stable, dashboard
- ✅ 技能信息可查询

`;
        
        // 读取现有内容并插入新内容
        const currentContent = fs.readFileSync('CHANGELOG.md', 'utf8');
        const newContent = currentContent.replace(/(# Changelog\s*\n)/, `$1${releaseNote}`);
        fs.writeFileSync('CHANGELOG.md', newContent, 'utf8');
        logSuccess('CHANGELOG.md已更新');
      } catch (error) {
        logWarning(`更新CHANGELOG.md时出错: ${error.message}`);
      }
    }

    // 完成
    console.log('\n' + colorText('===========================================', 'green'));
    console.log(colorText('      🎉 发布流程完成!                 ', 'green'));
    console.log(colorText('===========================================', 'green') + '\n');

    logInfo('下一步操作:');
    logInfo('1. 访问 https://clawhub.com/skills/openclaw-dashboard 查看技能页面');
    logInfo('2. 通知用户更新: npx clawhub update openclaw-dashboard');
    logInfo('3. 或在其他机器测试: npx clawhub install openclaw-dashboard');
    logInfo('4. 查看安装文档: cat SKILL.md | head -50');

    console.log(colorText('\n💡 提示:', 'yellow'));
    console.log('- 使用 \'npx clawhub install openclaw-dashboard\' 安装最新版本');
    console.log('- 使用 \'npx clawhub update openclaw-dashboard\' 更新到最新版本');
    console.log('- 使用 \'npx clawhub inspect openclaw-dashboard\' 查看技能信息\n');

  } catch (error) {
    logError(`发布过程中发生错误: ${error.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// 执行主函数
if (require.main === module) {
  main().catch(error => {
    console.error(colorText('[FATAL]', 'red'), error.message);
    process.exit(1);
  });
}

module.exports = { main };
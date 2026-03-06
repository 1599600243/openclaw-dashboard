/**
 * OpenClaw Dashboard 启动入口
 * 用于 npm start 命令
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

console.log('========================================');
console.log('🚀 OpenClaw Dashboard 启动');
console.log('========================================');

const platform = os.platform();
const isWindows = platform === 'win32';

console.log(`检测到操作系统: ${platform} (${isWindows ? 'Windows' : '非Windows'})`);

// 启动CLI代理服务
console.log('1️⃣ 启动CLI代理服务 (端口3002)...');
const cliProxy = spawn('node', ['backend/cli-proxy.js'], {
  stdio: 'inherit',
  cwd: __dirname
});

// 等待CLI代理启动
setTimeout(() => {
  console.log('2️⃣ 启动前端服务器 (端口3003)...');
  
  const frontendServer = spawn('node', ['backend/frontend-server.js'], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  console.log('========================================');
  console.log('🎉 服务启动完成！');
  console.log('========================================');
  console.log('');
  console.log('🌐 访问地址：');
  console.log('  • CLI代理API: http://localhost:3002');
  console.log('  • 健康检查: http://localhost:3002/health');
  console.log('  • 修复版Dashboard: http://localhost:3003/fixed-dashboard.html');
  console.log('  • 简单版Dashboard: http://localhost:3003/simple-dashboard.html');
  console.log('');
  console.log('💡 提示：');
  console.log('  • 按 Ctrl+C 停止所有服务');
  console.log('  • 如果使用有问题，请查看服务日志');
  console.log('========================================');
  
  // 信号处理
  const shutdown = () => {
    console.log('\n正在停止服务...');
    cliProxy.kill('SIGTERM');
    frontendServer.kill('SIGTERM');
    console.log('服务已停止');
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
}, 3000);

// 错误处理
cliProxy.on('error', (err) => {
  console.error('❌ CLI代理服务启动失败:', err.message);
  process.exit(1);
});
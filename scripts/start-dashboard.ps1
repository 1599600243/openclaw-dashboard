# OpenClaw Dashboard 启动脚本 (Windows PowerShell)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 OpenClaw Dashboard 控制面板启动" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查Node.js是否安装
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js 版本: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js 未安装或未在PATH中" -ForegroundColor Red
    Write-Host "   请从 https://nodejs.org/ 安装Node.js" -ForegroundColor Yellow
    exit 1
}

# 检查OpenClaw是否安装
try {
    $openclawVersion = openclaw --version 2>&1
    Write-Host "✅ OpenClaw CLI: $openclawVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️  OpenClaw CLI可能未安装或未在PATH中" -ForegroundColor Yellow
    Write-Host "   尝试继续运行..." -ForegroundColor Yellow
}

# 检查端口占用
function Test-PortInUse {
    param([int]$Port)
    try {
        $connection = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue
        return $connection.TcpTestSucceeded
    } catch {
        return $false
    }
}

$ports = @(3002, 3003)
foreach ($port in $ports) {
    if (Test-PortInUse -Port $port) {
        Write-Host "⚠️  端口 $port 已被占用，可能已有服务在运行" -ForegroundColor Yellow
    }
}

# 切换到脚本所在目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host ""
Write-Host "📂 工作目录: $projectRoot" -ForegroundColor Cyan

# 1. 启动CLI代理服务 (端口3002)
Write-Host "1️⃣ 启动CLI代理服务 (端口3002)..." -ForegroundColor Green
$cliProxyProcess = Start-Process -NoNewWindow -PassThru -FilePath "node" -ArgumentList "backend/cli-proxy.js"

# 等待服务启动
Start-Sleep -Seconds 3

# 测试CLI代理健康检查
Write-Host "2️⃣ 测试CLI代理连接..." -ForegroundColor Green
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3002/health" -TimeoutSec 5
    Write-Host "   ✅ CLI代理健康状态: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ CLI代理测试失败: $_" -ForegroundColor Red
    Write-Host "   正在停止已启动的进程..." -ForegroundColor Yellow
    Stop-Process -Id $cliProxyProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

# 2. 启动前端服务器 (端口3003)
Write-Host "3️⃣ 启动前端服务器 (端口3003)..." -ForegroundColor Green
$frontendProcess = Start-Process -NoNewWindow -PassThru -FilePath "node" -ArgumentList "backend/frontend-server.js"

Start-Sleep -Seconds 2

# 测试前端服务器
Write-Host "4️⃣ 测试前端服务器..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3003/simple-dashboard.html" -TimeoutSec 5 -UseBasicParsing
    Write-Host "   ✅ 前端服务器响应正常" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  前端服务器测试异常: $_" -ForegroundColor Yellow
}

# 显示访问信息
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🎉 OpenClaw Dashboard 启动完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 访问地址：" -ForegroundColor Yellow
Write-Host "  1. CLI代理API: http://localhost:3002" -ForegroundColor White
Write-Host "  2. 健康检查: http://localhost:3002/health" -ForegroundColor White
Write-Host "  3. 修复版Dashboard: http://localhost:3003/fixed-dashboard.html" -ForegroundColor White
Write-Host "  4. 简单版Dashboard: http://localhost:3003/simple-dashboard.html" -ForegroundColor White
Write-Host "  5. 测试页面: http://localhost:3003/test-direct.html" -ForegroundColor White
Write-Host ""
Write-Host "🔧 核心功能：" -ForegroundColor Yellow
Write-Host "  • ✅ 完全绕过Gateway设备配对" -ForegroundColor White
Write-Host "  • ✅ 使用OpenClaw CLI命令稳定通信" -ForegroundColor White
Write-Host "  • ✅ 实时会话管理" -ForegroundColor White
Write-Host "  • ✅ 消息发送与历史查看" -ForegroundColor White
Write-Host "  • ✅ 多会话支持" -ForegroundColor White
Write-Host ""
Write-Host "💡 使用提示：" -ForegroundColor Yellow
Write-Host "  1. 首次使用请访问: http://localhost:3003/fixed-dashboard.html" -ForegroundColor White
Write-Host "  2. 点击'刷新会话'加载所有OpenClaw会话" -ForegroundColor White
Write-Host "  3. 选择会话并发送消息测试" -ForegroundColor White
Write-Host "  4. 按F12查看浏览器控制台错误信息" -ForegroundColor White
Write-Host ""
Write-Host "🛠️  故障排除：" -ForegroundColor Yellow
Write-Host "  • 如果页面无法加载，等待几秒后刷新 (Ctrl+F5)" -ForegroundColor White
Write-Host "  • 检查端口3002和3003是否被占用" -ForegroundColor White
Write-Host "  • 确保OpenClaw CLI已正确安装" -ForegroundColor White
Write-Host "  • 查看CLI代理服务日志获取详细错误" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 停止所有服务并退出" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Cyan

# 等待用户按Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host ""
    Write-Host "正在停止服务..." -ForegroundColor Yellow
    
    # 停止进程
    if ($cliProxyProcess -and -not $cliProxyProcess.HasExited) {
        Stop-Process -Id $cliProxyProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "✅ CLI代理服务已停止" -ForegroundColor Green
    }
    
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "✅ 前端服务已停止" -ForegroundColor Green
    }
    
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "所有服务已停止，再见！👋" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
}
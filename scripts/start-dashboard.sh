#!/bin/bash

# OpenClaw Dashboard 启动脚本 (Linux/macOS)

echo "========================================"
echo "🚀 OpenClaw Dashboard 控制面板启动"
echo "========================================"
echo ""

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装或未在PATH中"
    echo "   请从 https://nodejs.org/ 安装Node.js"
    exit 1
else
    node_version=$(node --version)
    echo "✅ Node.js 版本: $node_version"
fi

# 检查OpenClaw是否安装
if ! command -v openclaw &> /dev/null; then
    echo "⚠️  OpenClaw CLI可能未安装或未在PATH中"
    echo "   尝试继续运行..."
else
    openclaw_version=$(openclaw --version 2>&1)
    echo "✅ OpenClaw CLI: $openclaw_version"
fi

# 检查端口占用
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "⚠️  端口 $port 已被占用，可能已有服务在运行"
        return 1
    else
        return 0
    fi
}

check_port 3002
check_port 3003

# 切换到脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT" || exit 1

echo ""
echo "📂 工作目录: $PROJECT_ROOT"

# 清理函数
cleanup() {
    echo ""
    echo "正在停止服务..."
    
    if [ -n "$CLI_PID" ] && kill -0 "$CLI_PID" 2>/dev/null; then
        kill -TERM "$CLI_PID"
        echo "✅ CLI代理服务已停止"
    fi
    
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill -TERM "$FRONTEND_PID"
        echo "✅ 前端服务已停止"
    fi
    
    echo "========================================"
    echo "所有服务已停止，再见！👋"
    echo "========================================"
    exit 0
}

# 设置信号处理
trap cleanup INT TERM EXIT

# 1. 启动CLI代理服务 (端口3002)
echo "1️⃣ 启动CLI代理服务 (端口3002)..."
node backend/cli-proxy.js &
CLI_PID=$!

# 等待服务启动
sleep 3

# 测试CLI代理健康检查
echo "2️⃣ 测试CLI代理连接..."
if curl -s http://localhost:3002/health --max-time 5 | grep -q '"status":"healthy"'; then
    echo "   ✅ CLI代理健康状态: healthy"
else
    echo "   ❌ CLI代理测试失败"
    echo "   正在停止已启动的进程..."
    cleanup
    exit 1
fi

# 2. 启动前端服务器 (端口3003)
echo "3️⃣ 启动前端服务器 (端口3003)..."
node backend/frontend-server.js &
FRONTEND_PID=$!

sleep 2

# 测试前端服务器
echo "4️⃣ 测试前端服务器..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/simple-dashboard.html --max-time 5 | grep -q "200"; then
    echo "   ✅ 前端服务器响应正常"
else
    echo "   ⚠️  前端服务器测试异常"
fi

# 显示访问信息
echo ""
echo "========================================"
echo "🎉 OpenClaw Dashboard 启动完成！"
echo "========================================"
echo ""
echo "🌐 访问地址："
echo "  1. CLI代理API: http://localhost:3002"
echo "  2. 健康检查: http://localhost:3002/health"
echo "  3. 修复版Dashboard: http://localhost:3003/fixed-dashboard.html"
echo "  4. 简单版Dashboard: http://localhost:3003/simple-dashboard.html"
echo "  5. 测试页面: http://localhost:3003/test-direct.html"
echo ""
echo "🔧 核心功能："
echo "  • ✅ 完全绕过Gateway设备配对"
echo "  • ✅ 使用OpenClaw CLI命令稳定通信"
echo "  • ✅ 实时会话管理"
echo "  • ✅ 消息发送与历史查看"
echo "  • ✅ 多会话支持"
echo ""
echo "💡 使用提示："
echo "  1. 首次使用请访问: http://localhost:3003/fixed-dashboard.html"
echo "  2. 点击'刷新会话'加载所有OpenClaw会话"
echo "  3. 选择会话并发送消息测试"
echo "  4. 按F12查看浏览器控制台错误信息"
echo ""
echo "🛠️  故障排除："
echo "  • 如果页面无法加载，等待几秒后刷新 (Ctrl+F5 或 Cmd+Shift+R)"
echo "  • 检查端口3002和3003是否被占用: lsof -i :3002"
echo "  • 确保OpenClaw CLI已正确安装"
echo "  • 查看CLI代理服务日志获取详细错误"
echo ""
echo "========================================"
echo "按 Ctrl+C 停止所有服务并退出"
echo "========================================"

# 等待信号
wait
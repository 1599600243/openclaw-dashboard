# OpenClaw Dashboard - ClawHub发布脚本
# 版本: 1.0.0
# 用法: .\scripts\publish-to-clawhub.ps1 [-Version <版本号>] [-Changelog <更新说明>]

param(
    [string]$Version,
    [string]$Changelog
)

# 设置错误处理
$ErrorActionPreference = "Stop"

# 颜色定义
$Green = "`e[32m"
$Yellow = "`e[33m"
$Red = "`e[31m"
$Blue = "`e[34m"
$Reset = "`e[0m"

function Write-Info {
    param([string]$Message)
    Write-Host "$Blue[INFO]$Reset $Message"
}

function Write-Success {
    param([string]$Message)
    Write-Host "$Green[SUCCESS]$Reset $Message"
}

function Write-Warning {
    param([string]$Message)
    Write-Host "$Yellow[WARNING]$Reset $Message"
}

function Write-Error {
    param([string]$Message)
    Write-Host "$Red[ERROR]$Reset $Message"
}

# 脚本标题
Write-Host "`n$Blue===========================================$Reset"
Write-Host "$Blue      OpenClaw Dashboard 发布工具       $Reset"
Write-Host "$Blue===========================================$Reset`n"

# 步骤1: 检查环境
Write-Info "步骤1: 检查环境..."

# 检查Node.js
try {
    $nodeVersion = node --version
    Write-Info "Node.js 版本: $nodeVersion"
} catch {
    Write-Error "Node.js 未安装或不在PATH中"
    exit 1
}

# 检查npm
try {
    $npmVersion = npm --version
    Write-Info "npm 版本: $npmVersion"
} catch {
    Write-Error "npm 未安装或不在PATH中"
    exit 1
}

# 检查ClawHub CLI
try {
    $clawhubVersion = npx --no-install clawhub --version
    Write-Info "ClawHub CLI 版本: $clawhubVersion"
} catch {
    Write-Warning "ClawHub CLI 未全局安装，将使用npx..."
}

# 步骤2: 检查登录状态
Write-Info "`n步骤2: 检查ClawHub登录状态..."
try {
    $whoamiResult = npx clawhub whoami 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "已登录ClawHub"
        Write-Info "用户信息: $whoamiResult"
    } else {
        Write-Warning "未登录或登录已过期"
        Write-Info "请运行: npx clawhub login"
        Write-Info "将打开浏览器进行登录验证..."
        
        $choice = Read-Host "是否现在登录? (y/n)"
        if ($choice -eq 'y' -or $choice -eq 'Y') {
            npx clawhub login
            if ($LASTEXITCODE -ne 0) {
                Write-Error "登录失败，请手动登录后再试"
                exit 1
            }
        } else {
            Write-Error "需要登录才能发布"
            exit 1
        }
    }
} catch {
    Write-Error "检查登录状态时出错: $_"
    exit 1
}

# 步骤3: 确定版本号
Write-Info "`n步骤3: 确定版本号..."

if ([string]::IsNullOrEmpty($Version)) {
    # 从package.json读取版本号
    try {
        $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
        $Version = $packageJson.version
        Write-Info "从package.json读取版本号: v$Version"
    } catch {
        Write-Error "无法读取package.json文件"
        exit 1
    }
} else {
    Write-Info "使用指定版本号: v$Version"
}

# 验证版本号格式
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "版本号格式不正确，请使用语义化版本 (如: 1.2.3)"
    exit 1
}

# 步骤4: 准备更新说明
Write-Info "`n步骤4: 准备更新说明..."

if ([string]::IsNullOrEmpty($Changelog)) {
    # 读取CHANGELOG.md获取更新说明
    try {
        if (Test-Path "CHANGELOG.md") {
            $changelogContent = Get-Content "CHANGELOG.md" -Raw
            # 提取当前版本的内容
            $pattern = "\[$Version\].*?(?=\n## \[|`$)"
            if ($changelogContent -match $pattern) {
                $Changelog = $matches[0].Trim()
                Write-Info "从CHANGELOG.md提取更新说明"
            } else {
                $Changelog = "v$Version: 功能更新和问题修复"
                Write-Warning "CHANGELOG.md中未找到版本 $Version 的详细说明，使用默认说明"
            }
        } else {
            $Changelog = "v$Version: OpenClaw Dashboard 控制面板更新"
            Write-Warning "CHANGELOG.md文件不存在，使用默认说明"
        }
    } catch {
        $Changelog = "v$Version: OpenClaw Dashboard 控制面板更新"
        Write-Warning "读取CHANGELOG.md时出错，使用默认说明"
    }
}

Write-Info "更新说明: $Changelog"

# 步骤5: 检查文件状态
Write-Info "`n步骤5: 检查文件状态..."

# 检查必要文件
$requiredFiles = @(
    "SKILL.md",
    "package.json",
    "backend/cli-proxy.js",
    "backend/frontend-server.js",
    "frontend/chat-dashboard.html"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Error "缺少必要文件:"
    foreach ($file in $missingFiles) {
        Write-Error "  - $file"
    }
    exit 1
}

Write-Success "所有必要文件都存在"

# 步骤6: 更新SKILL.md中的版本号
Write-Info "`n步骤6: 更新SKILL.md版本号..."
try {
    $skillContent = Get-Content "SKILL.md" -Raw
    $updatedContent = $skillContent -replace '(?s)---\s*name:.*?version:\s*\d+\.\d+\.\d+', "---`nname: openclaw-dashboard`nversion: $Version"
    
    if ($skillContent -ne $updatedContent) {
        Set-Content "SKILL.md" $updatedContent -Encoding UTF8
        Write-Success "SKILL.md版本号已更新为 v$Version"
    } else {
        Write-Info "SKILL.md版本号已是最新"
    }
} catch {
    Write-Warning "更新SKILL.md版本号时出错: $_"
}

# 步骤7: 执行发布
Write-Info "`n步骤7: 执行发布到ClawHub..."

$publishCommand = @(
    "npx", "clawhub", "publish", ".",
    "--slug", "openclaw-dashboard",
    "--name", "OpenClaw Dashboard",
    "--version", $Version,
    "--tags", "latest,stable,dashboard",
    "--changelog", $Changelog
)

Write-Info "执行命令: $($publishCommand -join ' ')"

try {
    & npx @("clawhub", "publish", ".", 
        "--slug", "openclaw-dashboard",
        "--name", "OpenClaw Dashboard", 
        "--version", $Version,
        "--tags", "latest,stable,dashboard",
        "--changelog", $Changelog)
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "✅ 发布成功! 版本 v$Version 已发布到ClawHub"
    } else {
        Write-Error "发布失败，退出码: $LASTEXITCODE"
        exit 1
    }
} catch {
    Write-Error "发布过程中出错: $_"
    exit 1
}

# 步骤8: 验证发布
Write-Info "`n步骤8: 验证发布结果..."

try {
    Write-Info "检查技能信息..."
    $inspectResult = npx clawhub inspect openclaw-dashboard 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "技能信息查询成功"
        # 检查版本是否包含当前版本
        if ($inspectResult -match $Version) {
            Write-Success "✅ 版本 v$Version 确认存在"
        }
    }
} catch {
    Write-Warning "验证发布时出错: $_"
}

# 步骤9: 后置操作
Write-Info "`n步骤9: 后置操作..."

# 询问是否创建Git标签
$createTag = Read-Host "是否创建Git标签 v$Version? (y/n)"
if ($createTag -eq 'y' -or $createTag -eq 'Y') {
    try {
        git tag -a "v$Version" -m "v$Version: $Changelog"
        git push origin "v$Version"
        Write-Success "Git标签 v$Version 创建并推送成功"
    } catch {
        Write-Warning "创建Git标签时出错: $_"
    }
}

# 询问是否更新CHANGELOG.md
$updateChangelog = Read-Host "`n是否在CHANGELOG.md中添加发布记录? (y/n)"
if ($updateChangelog -eq 'y' -or $updateChangelog -eq 'Y') {
    try {
        $date = Get-Date -Format "yyyy-MM-dd"
        $releaseNote = @"

## [$Version] - $date

### 发布信息
- **发布时间**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
- **发布渠道**: ClawHub
- **发布状态**: ✅ 成功
- **更新说明**: $Changelog

### 验证结果
- ✅ ClawHub发布成功
- ✅ 版本号: v$Version
- ✅ 标签: latest, stable, dashboard
- ✅ 技能信息可查询

"@
        
        # 读取现有内容
        $currentContent = Get-Content "CHANGELOG.md" -Raw
        # 在开头插入新内容
        $newContent = $currentContent -replace "(# Changelog\s*\n)", "`$1`n$releaseNote"
        Set-Content "CHANGELOG.md" $newContent -Encoding UTF8
        Write-Success "CHANGELOG.md已更新"
    } catch {
        Write-Warning "更新CHANGELOG.md时出错: $_"
    }
}

# 完成
Write-Host "`n$Green===========================================$Reset"
Write-Host "$Green      🎉 发布流程完成!                 $Reset"
Write-Host "$Green===========================================$Reset`n"

Write-Info "下一步操作:"
Write-Info "1. 访问 https://clawhub.com/skills/openclaw-dashboard 查看技能页面"
Write-Info "2. 通知用户更新: npx clawhub update openclaw-dashboard"
Write-Info "3. 或在其他机器测试: npx clawhub install openclaw-dashboard"
Write-Info "4. 查看安装文档: cat SKILL.md | head -50"

Write-Host "`n$Yellow💡 提示:$Reset"
Write-Host "- 使用 'npx clawhub install openclaw-dashboard' 安装最新版本"
Write-Host "- 使用 'npx clawhub update openclaw-dashboard' 更新到最新版本"
Write-Host "- 使用 'npx clawhub inspect openclaw-dashboard' 查看技能信息`n"
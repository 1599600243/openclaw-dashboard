/**
 * OpenClaw CLI代理 - 绕过Gateway认证问题
 * 端口：3002
 */

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.CLI_PROXY_PORT || 3002;

// CORS中间件
app.use((req, res, next) => {
  // 允许所有来源访问（生产环境应限制）
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// 其他中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 安全执行CLI命令
 */
async function runCommand(cmd, timeout = 30000) {
  return new Promise((resolve, reject) => {
    console.log(`执行命令: ${cmd}`);
    
    exec(cmd, { 
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeout,
      encoding: 'utf8'
    }, (error, stdout, stderr) => {
      // 检查是否是警告信息（OpenClaw的Config warnings）
      const isWarning = stderr && (
        stderr.includes('Config warnings:') || 
        stderr.includes('plugin operator-ui: plugin id mismatch')
      );
      
      if (error) {
        console.error(`命令错误: ${error.message}`);
        
        // 如果错误信息包含已知的警告，可能不是真正的失败
        if (error.message.includes('Config warnings:')) {
          console.warn('检测到警告信息，可能不是真正的错误');
          // 尝试从stdout或stderr中提取实际输出
          const output = stdout || stderr || '';
          if (output.trim().length > 0) {
            resolve(output);
          } else {
            reject(new Error(`命令执行失败: ${error.message}`));
          }
        } else {
          reject(new Error(`命令执行失败: ${error.message}`));
        }
      } else if (stderr && !isWarning) {
        console.warn(`命令警告: ${stderr.substring(0, 200)}...`);
        // 有些命令会在stderr输出，但实际成功
        resolve(stdout || stderr);
      } else {
        // 如果是警告信息，记录但不视为错误
        if (isWarning) {
          console.warn(`检测到OpenClaw配置警告: ${stderr.substring(0, 100)}...`);
        }
        
        const output = stdout || (isWarning ? '' : stderr);
        console.log(`命令完成，输出长度: ${output.length}字节`);
        resolve(output);
      }
    });
  });
}

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    message: 'OpenClaw CLI代理运行正常'
  });
});

/**
 * 获取所有会话
 */
app.get('/api/sessions', async (req, res) => {
  try {
    const output = await runCommand('openclaw sessions --json');
    
    try {
      const result = JSON.parse(output);
      
      // 转换会话数据字段名，适配前端代码
      const sessions = result.sessions || [];
      const transformedSessions = sessions.map(session => {
        // 关键修复：使用 sessionId 作为发送消息的标识符
        // key字段是"agent:main:main"格式，不能用于--session-id参数
        // sessionId字段是UUID格式，才是正确的参数
        return {
          sessionKey: session.sessionId || session.key, // 优先使用sessionId
          sessionId: session.sessionId, // 保留原始sessionId
          originalKey: session.key, // 保留原始key
          label: session.label || session.agentId || '未命名会话',
          agentId: session.agentId || 'main',
          lastMessageAt: new Date(session.updatedAt || Date.now()).toISOString(),
          messageCount: session.inputTokens ? Math.floor(session.inputTokens / 10) : 0, // 估算消息数
          model: session.model || 'unknown',
          ageMs: session.ageMs || 0,
          // 保留原始数据
          ...session
        };
      });
      
      res.json({
        success: true,
        data: {
          sessions: transformedSessions,
          count: transformedSessions.length,
          total: result.count || transformedSessions.length
        },
        count: transformedSessions.length
      });
    } catch (parseError) {
      console.error('JSON解析失败:', parseError);
      // 如果JSON解析失败，尝试清理输出
      const cleaned = output.trim();
      res.json({
        success: true,
        data: {
          sessions: cleaned.split('\n')
            .map(line => {
              try { 
                const session = JSON.parse(line);
                return {
                  sessionKey: session.key || session.sessionId || 'unknown',
                  label: session.label || session.agentId || '未命名会话',
                  agentId: session.agentId || 'main',
                  lastMessageAt: new Date().toISOString(),
                  messageCount: 0
                };
              } catch { 
                return null; 
              }
            })
            .filter(item => item),
          count: 0
        },
        rawOutput: cleaned,
        warning: '输出包含非JSON内容'
      });
    }
  } catch (error) {
    console.error('获取会话失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      suggestion: '请检查OpenClaw是否安装并配置正确'
    });
  }
});

/**
 * 发送消息到会话
 */
app.post('/api/sessions/:sessionKey/messages', async (req, res) => {
  try {
    const { sessionKey } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: '消息内容不能为空'
      });
    }
    
    console.log(`发送消息到会话 ${sessionKey}: ${message}`);
    
    // 转义消息中的特殊字符
    const escapedMessage = message.replace(/"/g, '\\"');
    
    // 重要修复：前端传递的sessionKey应该是sessionId（UUID格式）
    // 如果前端传递的是"agent:main:main"格式，我们需要转换为sessionId
    // 但在数据转换中我们已经修复了这个问题，前端应该传递sessionId
    
    // 检查sessionKey格式
    let sessionId = sessionKey;
    
    // 如果是"agent:main:main"格式，需要从会话数据中查找对应的sessionId
    if (sessionKey.includes('agent:')) {
      console.warn(`警告：接收到可能错误的sessionKey格式: ${sessionKey}`);
      // 尝试从内存中查找或重新获取会话数据
      // 暂时使用原值，依赖前端修复
    }
    
    // 添加--local参数强制使用本地代理，绕过Gateway配对
    // 添加--json参数获取结构化输出
    const cmd = `openclaw agent --session-id ${sessionId} --message "${escapedMessage}" --local --json`;
    
    console.log(`发送消息命令: ${cmd}`);
    
    const output = await runCommand(cmd, 30000); // 30秒超时
    
    res.json({
      success: true,
      message: '消息发送成功',
      sessionKey: sessionKey,
      output: output
    });
  } catch (error) {
    console.error('发送消息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取会话历史（兼容旧版路径）
 */
app.get('/api/sessions/:sessionKey/history', async (req, res) => {
  try {
    const { sessionKey } = req.params;
    const limit = req.query.limit || 50;
    
    const result = await getSessionMessages(sessionKey, limit);
    res.json(result);
  } catch (error) {
    console.error('获取历史失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取会话消息（新版路径，符合用户要求）
 */
app.get('/api/session/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = req.query.limit || 200; // 默认更多消息
    
    const result = await getSessionMessages(sessionId, limit);
    res.json(result);
  } catch (error) {
    console.error('获取消息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取会话消息的通用函数
 */
async function getSessionMessages(sessionId, limit = 50) {
  // 尝试多种可能的文件路径
  const possiblePaths = [
    // 路径1: ~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl
    path.join(
      process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw',
      'agents',
      'main', // 默认agentId为main，可以从sessionId解析agent信息
      'sessions',
      `${sessionId}.jsonl`
    ),
    // 路径2: ~/.openclaw/sessions/<sessionId>/messages.jsonl
    path.join(
      process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw',
      'sessions',
      sessionId,
      'messages.jsonl'
    ),
    // 路径3: ~/.openclaw/agents/main/sessions/<sessionId>/messages.jsonl
    path.join(
      process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw',
      'agents',
      'main',
      'sessions',
      sessionId,
      'messages.jsonl'
    )
  ];
  
  let fileContent = '';
  let foundPath = '';
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      foundPath = filePath;
      fileContent = fs.readFileSync(filePath, 'utf8');
      break;
    }
  }
  
  if (!fileContent) {
    return {
      success: true,
      sessionId: sessionId,
      messages: [],
      count: 0,
      note: '暂无历史消息',
      warning: `未找到会话文件，尝试了以下路径: ${possiblePaths.map(p => path.basename(p)).join(', ')}`
    };
  }
  
  const lines = fileContent.trim().split('\n').filter(line => line.trim());
  const rawMessages = lines.slice(-limit).map(line => {
    try {
      return JSON.parse(line);
    } catch (error) {
      console.warn(`解析JSONL行失败: ${line.substring(0, 100)}`);
      return { raw: line, error: '解析失败' };
    }
  });
  
  // 转换消息格式为统一的前端格式
  const messages = rawMessages.map(msg => {
    // OpenClaw JSONL格式可能是多种类型
    // 类型1: {"type":"user","content":"hello"}
    // 类型2: {"role":"user","content":"hello"}
    // 类型3: {"role":"human","content":"hello"}
    // 类型4: {"role":"assistant","content":"hi"}
    // 类型5: {"type":"tool","name":"search","result":"..."}
    
    const result = { ...msg };
    
    // 标准化role字段
    if (msg.type === 'user' || msg.role === 'human' || msg.role === 'user') {
      result.role = 'user';
    } else if (msg.type === 'assistant' || msg.role === 'assistant') {
      result.role = 'assistant';
    } else if (msg.type === 'tool' || msg.name) {
      result.role = 'tool';
      result.toolName = msg.name || 'unknown';
      result.content = msg.result || msg.content || JSON.stringify(msg);
    } else if (msg.role) {
      result.role = msg.role;
    } else {
      result.role = 'unknown';
    }
    
    // 标准化content字段
    if (!result.content && msg.text) {
      result.content = msg.text;
    } else if (!result.content && msg.message) {
      result.content = msg.message;
    } else if (!result.content) {
      result.content = JSON.stringify(msg);
    }
    
    // 添加时间戳
    if (!result.timestamp && msg.timestamp) {
      result.timestamp = msg.timestamp;
    } else if (!result.timestamp && msg.time) {
      result.timestamp = msg.time;
    } else if (!result.timestamp) {
      result.timestamp = new Date().toISOString();
    }
    
    return result;
  });
  
  // 最新消息在前
  const sortedMessages = messages.reverse();
  
  return {
    success: true,
    sessionId: sessionId,
    messages: sortedMessages,
    count: sortedMessages.length,
    total: lines.length,
    filePath: foundPath ? path.basename(foundPath) : 'not found'
  };
}

/**
 * 运行自定义命令（调试用）
 */
app.post('/api/cli', async (req, res) => {
  try {
    const { command } = req.body;
    
    if (!command || !command.startsWith('openclaw')) {
      return res.status(400).json({
        success: false,
        error: '只允许执行openclaw命令'
      });
    }
    
    const output = await runCommand(command);
    
    res.json({
      success: true,
      command: command,
      output: output
    });
  } catch (error) {
    console.error('CLI命令失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 测试OpenClaw连接
 */
app.get('/api/test', async (req, res) => {
  try {
    const version = await runCommand('openclaw --version');
    const sessions = await runCommand('openclaw sessions --json');
    
    res.json({
      success: true,
      version: version.trim(),
      sessionsCount: JSON.parse(sessions).length,
      status: 'OpenClaw CLI工作正常'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      suggestion: '请检查OpenClaw是否安装正确'
    });
  }
});

/**
 * 获取系统状态
 */
app.get('/api/status', async (req, res) => {
  try {
    const [version, sessions, gatewayStatus] = await Promise.all([
      runCommand('openclaw --version').catch(() => '未知'),
      runCommand('openclaw sessions --json').catch(() => '[]'),
      runCommand('openclaw gateway status --json').catch(() => '{}')
    ]);
    
    res.json({
      success: true,
      status: {
        version: version.trim(),
        sessions: JSON.parse(sessions).length,
        gateway: JSON.parse(gatewayStatus),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.json({
      success: true,
      status: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * 调试：检查会话文件路径
 */
app.get('/api/debug/session/:sessionId/paths', (req, res) => {
  const { sessionId } = req.params;
  const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
  
  const possiblePaths = [
    // 路径1: ~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl
    path.join(stateDir, 'agents', 'main', 'sessions', `${sessionId}.jsonl`),
    // 路径2: ~/.openclaw/sessions/<sessionId>/messages.jsonl
    path.join(stateDir, 'sessions', sessionId, 'messages.jsonl'),
    // 路径3: ~/.openclaw/agents/main/sessions/<sessionId>/messages.jsonl
    path.join(stateDir, 'agents', 'main', 'sessions', sessionId, 'messages.jsonl'),
    // 路径4: 检查state目录结构
    path.join(stateDir, 'state', 'agents', 'main', 'sessions', `${sessionId}.jsonl`)
  ];
  
  const results = possiblePaths.map(filePath => ({
    path: filePath,
    exists: fs.existsSync(filePath),
    readable: fs.existsSync(filePath) ? true : false,
    size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
  }));
  
  // 检查目录结构
  const dirsToCheck = [
    path.join(stateDir, 'agents'),
    path.join(stateDir, 'sessions'),
    path.join(stateDir, 'state')
  ];
  
  const dirResults = dirsToCheck.map(dirPath => ({
    path: dirPath,
    exists: fs.existsSync(dirPath),
    isDirectory: fs.existsSync(dirPath) ? fs.statSync(dirPath).isDirectory() : false
  }));
  
  res.json({
    success: true,
    sessionId: sessionId,
    stateDir: stateDir,
    possiblePaths: results,
    directoryStructure: dirResults,
    note: '用于调试会话文件位置'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在',
    path: req.path
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 OpenClaw CLI代理服务已启动`);
  console.log(`📍 地址: http://localhost:${PORT}`);
  console.log(`📡 健康检查: http://localhost:${PORT}/health`);
  console.log(`📊 会话列表: http://localhost:${PORT}/api/sessions`);
  console.log(`🔧 绕过Gateway WebSocket认证`);
  console.log(`========================================`);
  
  // 自动测试连接
  setTimeout(async () => {
    try {
      const test = await runCommand('openclaw --version');
      console.log(`✅ OpenClaw版本: ${test.trim()}`);
    } catch (error) {
      console.error(`❌ OpenClaw测试失败: ${error.message}`);
    }
  }, 1000);
});

module.exports = app;
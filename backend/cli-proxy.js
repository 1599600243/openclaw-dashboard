/**
 * OpenClaw CLI代理 - 绕过Gateway认证问题
 * 端口：3002
 */

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

/**
 * 功能2：自定义会话管理 API
 */

/**
 * 创建新会话
 */
app.post('/api/sessions', async (req, res) => {
  try {
    const { label, agentId = 'main' } = req.body;
    
    if (!label || typeof label !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少label参数或格式不正确'
      });
    }
    
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    
    // 检查agent目录是否存在
    const agentDir = path.join(stateDir, 'agents', agentId);
    if (!fs.existsSync(agentDir)) {
      return res.status(400).json({
        success: false,
        error: `Agent目录不存在: ${agentId}`,
        availableAgents: await getAvailableAgents(stateDir),
        suggestion: '请使用以下可用的Agent: ' + (await getAvailableAgents(stateDir)).join(', ')
      });
    }
    
    // 确保sessions目录存在
    const sessionsDir = path.join(agentDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
    
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
    
    // 读取现有的sessions.json
    let sessionsData = {};
    if (fs.existsSync(sessionsJsonPath)) {
      const content = fs.readFileSync(sessionsJsonPath, 'utf8');
      try {
        sessionsData = JSON.parse(content);
      } catch (error) {
        console.warn('无法解析sessions.json，将创建新文件:', error.message);
      }
    }
    
    // 生成唯一的sessionId和sessionKey
    const sessionId = crypto.randomUUID();
    let sessionKey = label;
    
    // 确保sessionKey唯一
    const existingKeys = Object.keys(sessionsData);
    let finalSessionKey = sessionKey;
    let counter = 1;
    while (existingKeys.includes(`agent:${agentId}:${finalSessionKey}`)) {
      finalSessionKey = `${sessionKey}-${counter}`;
      counter++;
    }
    
    // 创建会话文件路径
    const sessionFilePath = path.join(sessionsDir, `${sessionId}.jsonl`);
    
    // 创建空的jsonl文件
    fs.writeFileSync(sessionFilePath, '', 'utf8');
    
    // 构建会话元数据
    const now = Date.now();
    const sessionEntry = {
      sessionId: sessionId,
      updatedAt: now,
      systemSent: false,
      abortedLastRun: false,
      chatType: 'direct',
      deliveryContext: {
        channel: 'dashboard'
      },
      lastChannel: 'dashboard',
      origin: {
        provider: 'dashboard',
        surface: 'dashboard',
        chatType: 'direct'
      },
      sessionFile: sessionFilePath,
      compactionCount: 0,
      modelProvider: 'deepseek',
      model: 'deepseek-reasoner',
      totalTokensFresh: true,
      cacheRead: 0,
      cacheWrite: 0,
      contextTokens: 128000,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      agentId: agentId,
      customLabel: label // 存储原始label
    };
    
    // 添加到sessions.json
    sessionsData[`agent:${agentId}:${finalSessionKey}`] = sessionEntry;
    
    // 写回文件
    fs.writeFileSync(sessionsJsonPath, JSON.stringify(sessionsData, null, 2), 'utf8');
    
    res.json({
      success: true,
      session: {
        sessionId: sessionId,
        sessionKey: finalSessionKey,
        label: label,
        agentId: agentId,
        filePath: sessionFilePath,
        createdAt: now
      },
      message: '会话创建成功'
    });
    
  } catch (error) {
    console.error('创建会话失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取可用Agent列表
 */
async function getAvailableAgents(stateDir) {
  try {
    const agentsDir = path.join(stateDir, 'agents');
    if (!fs.existsSync(agentsDir)) {
      return [];
    }
    
    const items = fs.readdirSync(agentsDir, { withFileTypes: true });
    return items
      .filter(item => item.isDirectory())
      .map(item => item.name);
  } catch (error) {
    console.error('获取Agent列表失败:', error);
    return [];
  }
}

/**
 * 获取可用的Agent列表（增强版，读取openclaw.json配置）
 */
app.get('/api/agents', async (req, res) => {
  try {
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const configPath = path.join(stateDir, 'openclaw.json');
    
    // 读取OpenClaw配置文件
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    const agentsList = config.agents?.list || [];
    const agentsDefaults = config.agents?.defaults || {};
    
    // 获取每个Agent的详细信息和会话数量
    const agentsWithDetails = await Promise.all(agentsList.map(async (agentConfig) => {
      const agentId = agentConfig.id;
      const sessionsDir = path.join(stateDir, 'agents', agentId, 'sessions');
      let sessionCount = 0;
      let lastActiveTime = null;
      
      if (fs.existsSync(sessionsDir)) {
        try {
          const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
          if (fs.existsSync(sessionsJsonPath)) {
            const content = fs.readFileSync(sessionsJsonPath, 'utf8');
            const sessionsData = JSON.parse(content);
            sessionCount = Object.keys(sessionsData).length;
            
            // 获取最后活跃时间
            const sessions = Object.values(sessionsData);
            if (sessions.length > 0) {
              const latestSession = sessions.reduce((latest, session) => {
                return (session.updatedAt > latest.updatedAt) ? session : latest;
              });
              lastActiveTime = latestSession.updatedAt;
            }
          }
        } catch (error) {
          console.warn(`无法读取Agent ${agentId}的会话数据:`, error.message);
        }
      }
      
      // 合并默认配置和代理特定配置
      const mergedConfig = {
        ...agentsDefaults,
        ...agentConfig
      };
      
      // 确定使用的模型
      let model = 'unknown';
      if (mergedConfig.model) {
        if (typeof mergedConfig.model === 'string') {
          model = mergedConfig.model;
        } else if (mergedConfig.model.primary) {
          model = mergedConfig.model.primary;
        }
      }
      
      return {
        id: agentId,
        name: agentConfig.name || (agentId === 'main' ? '主Agent' : agentId),
        displayName: agentConfig.displayName || (agentId === 'main' ? '主Agent' : agentId),
        description: agentConfig.description || (agentId === 'main' ? '默认主Agent' : `自定义Agent: ${agentId}`),
        sessionCount: sessionCount,
        lastActiveTime: lastActiveTime,
        model: model,
        workspace: mergedConfig.workspace || agentsDefaults.workspace,
        maxConcurrent: mergedConfig.maxConcurrent || agentsDefaults.maxConcurrent,
        isDefault: agentId === 'main',
        config: agentConfig,
        directory: path.join(stateDir, 'agents', agentId)
      };
    }));
    
    res.json({
      success: true,
      agents: agentsWithDetails,
      defaults: agentsDefaults,
      count: agentsWithDetails.length
    });
    
  } catch (error) {
    console.error('获取Agent列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取可用模型列表
 */
app.get('/api/agents/models', async (req, res) => {
  try {
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const configPath = path.join(stateDir, 'openclaw.json');
    
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    const models = [];
    
    // 从config.models.providers读取所有可用模型
    if (config.models?.providers) {
      Object.keys(config.models.providers).forEach(provider => {
        const providerConfig = config.models.providers[provider];
        if (providerConfig.models && Array.isArray(providerConfig.models)) {
          providerConfig.models.forEach(model => {
            models.push({
              value: `${provider}/${model.id}`,
              label: model.name || model.id,
              provider: provider,
              id: model.id,
              contextWindow: model.contextWindow || 128000,
              maxTokens: model.maxTokens || 8192,
              reasoning: model.reasoning || false
            });
          });
        }
      });
    }
    
    res.json({
      success: true,
      models: models,
      count: models.length
    });
    
  } catch (error) {
    console.error('获取模型列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取已安装技能列表
 */
app.get('/api/agents/skills', async (req, res) => {
  try {
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const configPath = path.join(stateDir, 'openclaw.json');
    
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    const skills = [];
    
    // 从config.skills.entries读取技能
    if (config.skills?.entries) {
      Object.keys(config.skills.entries).forEach(skillId => {
        const skillConfig = config.skills.entries[skillId];
        skills.push({
          id: skillId,
          name: skillId,
          enabled: skillConfig.enabled !== false,
          description: skillConfig.description || `技能: ${skillId}`
        });
      });
    }
    
    res.json({
      success: true,
      skills: skills,
      count: skills.length
    });
    
  } catch (error) {
    console.error('获取技能列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 创建新代理
 */
app.post('/api/agents', async (req, res) => {
  try {
    const {
      id,
      name,
      displayName,
      description,
      model,
      workspace,
      maxConcurrent = 2,
      skills = [],
      template
    } = req.body;
    
    // 验证必填参数
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: '代理ID不能为空且必须是字符串'
      });
    }
    
    // 验证ID格式（只允许字母、数字、连字符、下划线）
    const idRegex = /^[a-zA-Z0-9_-]+$/;
    if (!idRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: '代理ID只能包含字母、数字、连字符和下划线'
      });
    }
    
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const configPath = path.join(stateDir, 'openclaw.json');
    
    // 读取配置文件
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // 检查代理是否已存在
    const existingAgent = config.agents?.list?.find(agent => agent.id === id);
    if (existingAgent) {
      return res.status(400).json({
        success: false,
        error: `代理 "${id}" 已存在`
      });
    }
    
    // 构建代理配置 - 只使用OpenClaw官方支持的字段
    const agentConfig = {
      id: id
    };
    
    // 添加可选字段 - 只使用OpenClaw官方支持的字段
    if (name && name !== id) agentConfig.name = name;
    
    // 模型配置 - OpenClaw支持字符串或对象格式
    if (model) {
      if (typeof model === 'string') {
        agentConfig.model = model;
      } else if (model.primary) {
        agentConfig.model = {
          primary: model.primary,
          fallbacks: model.fallbacks || []
        };
      }
    }
    
    // 工作区配置 - OpenClaw支持workspace字段
    let finalWorkspace = workspace;
    if (!finalWorkspace) {
      // 默认工作区路径
      finalWorkspace = path.join(stateDir, `workspace-${id}`);
    }
    agentConfig.workspace = finalWorkspace;
    
    // 注意：OpenClaw不直接支持以下字段：
    // - displayName (使用name字段代替)
    // - description (不存储到配置中，可在前端缓存)
    // - maxConcurrent (使用agents.defaults中的全局设置)
    // - skills (技能是全局配置，不是按代理的)
    
    // 注意：displayName和description等自定义字段可以存储在前端的localStorage中
    // 但不应写入openclaw.json，因为OpenClaw会验证配置并拒绝这些字段
    
    // 创建工作区目录
    if (!fs.existsSync(finalWorkspace)) {
      fs.mkdirSync(finalWorkspace, { recursive: true });
      console.log(`已创建工作区目录: ${finalWorkspace}`);
    }
    
    // 创建Agent目录
    const agentDir = path.join(stateDir, 'agents', id);
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }
    
    // 创建sessions目录
    const sessionsDir = path.join(agentDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
    
    // 初始化空的sessions.json
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
    if (!fs.existsSync(sessionsJsonPath)) {
      fs.writeFileSync(sessionsJsonPath, '{}', 'utf8');
    }
    
    // 添加到配置
    if (!config.agents) config.agents = {};
    if (!config.agents.list) config.agents.list = [];
    config.agents.list.push(agentConfig);
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    // 热加载配置
    try {
      await runCommand('openclaw config reload', 10000);
    } catch (error) {
      console.warn('配置热加载失败（不影响代理创建）:', error.message);
    }
    
    res.json({
      success: true,
      agent: {
        id: id,
        name: name || id,
        // 注意：displayName和description不是OpenClaw配置的一部分
        // 这些字段可以存储在前端缓存中，但不在openclaw.json中
        displayName: displayName || name || id,
        description: description || '',
        workspace: finalWorkspace,
        config: agentConfig
      },
      message: '代理创建成功，配置已更新',
      note: 'displayName和description字段仅用于前端显示，不会保存到openclaw.json配置中'
    });
    
  } catch (error) {
    console.error('创建代理失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 更新代理配置
 */
app.put('/api/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const updates = req.body;
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: '更新数据不能为空且必须是对象'
      });
    }
    
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const configPath = path.join(stateDir, 'openclaw.json');
    
    // 读取配置文件
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // 查找代理
    const agentIndex = config.agents?.list?.findIndex(agent => agent.id === agentId);
    if (agentIndex === -1 || agentIndex === undefined) {
      return res.status(404).json({
        success: false,
        error: `代理 "${agentId}" 不存在`
      });
    }
    
    // 更新代理配置
    const currentAgent = config.agents.list[agentIndex];
    
    // 只更新OpenClaw官方支持的字段
    // OpenClaw支持的代理字段: id, name, workspace, model
    const supportedFields = ['name', 'workspace', 'model'];
    
    // 过滤更新，只保留支持的字段
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && supportedFields.includes(key)) {
        currentAgent[key] = updates[key];
      } else if (key !== 'id') {
        // 记录但不保存不支持的字段
        console.log(`忽略不支持的代理字段: ${key} = ${JSON.stringify(updates[key])}`);
        console.log(`OpenClaw配置验证会拒绝此字段，请使用前端缓存存储自定义字段`);
      }
    });
    
    // 处理工作区目录（如果工作区路径变更）
    if (updates.workspace && updates.workspace !== currentAgent.workspace) {
      const newWorkspace = updates.workspace;
      if (!fs.existsSync(newWorkspace)) {
        fs.mkdirSync(newWorkspace, { recursive: true });
        console.log(`已创建新工作区目录: ${newWorkspace}`);
      }
    }
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    // 热加载配置
    try {
      await runCommand('openclaw config reload', 10000);
    } catch (error) {
      console.warn('配置热加载失败（不影响代理更新）:', error.message);
    }
    
    res.json({
      success: true,
      agent: currentAgent,
      message: '代理配置更新成功'
    });
    
  } catch (error) {
    console.error('更新代理失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 删除代理
 */
app.delete('/api/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { deleteSessions = false, deleteWorkspace = false } = req.query;
    
    // 不允许删除main代理
    if (agentId === 'main') {
      return res.status(400).json({
        success: false,
        error: '不能删除主代理（main）'
      });
    }
    
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const configPath = path.join(stateDir, 'openclaw.json');
    
    // 读取配置文件
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // 查找代理
    const agentIndex = config.agents?.list?.findIndex(agent => agent.id === agentId);
    if (agentIndex === -1 || agentIndex === undefined) {
      return res.status(404).json({
        success: false,
        error: `代理 "${agentId}" 不存在`
      });
    }
    
    const agentConfig = config.agents.list[agentIndex];
    
    // 删除会话文件（如果选择）
    if (deleteSessions === 'true') {
      const sessionsDir = path.join(stateDir, 'agents', agentId, 'sessions');
      if (fs.existsSync(sessionsDir)) {
        try {
          // 删除所有jsonl文件
          const files = fs.readdirSync(sessionsDir);
          files.forEach(file => {
            if (file.endsWith('.jsonl')) {
              fs.unlinkSync(path.join(sessionsDir, file));
            }
          });
          // 删除sessions.json
          const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
          if (fs.existsSync(sessionsJsonPath)) {
            fs.unlinkSync(sessionsJsonPath);
          }
          console.log(`已删除代理 ${agentId} 的所有会话文件`);
        } catch (error) {
          console.warn(`删除会话文件失败:`, error.message);
        }
      }
    }
    
    // 删除工作区目录（如果选择）
    if (deleteWorkspace === 'true' && agentConfig.workspace) {
      const workspacePath = agentConfig.workspace;
      if (fs.existsSync(workspacePath) && workspacePath.includes(stateDir)) {
        try {
          // 安全删除：只删除在.openclaw目录下的工作区
          fs.rmSync(workspacePath, { recursive: true, force: true });
          console.log(`已删除工作区目录: ${workspacePath}`);
        } catch (error) {
          console.warn(`删除工作区目录失败:`, error.message);
        }
      }
    }
    
    // 从配置中移除代理
    config.agents.list.splice(agentIndex, 1);
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    // 热加载配置
    try {
      await runCommand('openclaw config reload', 10000);
    } catch (error) {
      console.warn('配置热加载失败（不影响代理删除）:', error.message);
    }
    
    res.json({
      success: true,
      deletedAgent: {
        id: agentId,
        name: agentConfig.name || agentId,
        workspace: agentConfig.workspace
      },
      message: '代理删除成功'
    });
    
  } catch (error) {
    console.error('删除代理失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 重新加载配置
 */
app.post('/api/config/reload', async (req, res) => {
  try {
    await runCommand('openclaw config reload', 10000);
    
    res.json({
      success: true,
      message: '配置重新加载成功'
    });
  } catch (error) {
    console.error('重新加载配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取单个代理的会话列表
 */
app.get('/api/agents/:agentId/sessions', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const sessionsJsonPath = path.join(stateDir, 'agents', agentId, 'sessions', 'sessions.json');
    
    if (!fs.existsSync(sessionsJsonPath)) {
      return res.json({
        success: true,
        agentId: agentId,
        sessions: [],
        count: 0,
        note: '该代理暂无会话'
      });
    }
    
    const content = fs.readFileSync(sessionsJsonPath, 'utf8');
    let sessionsData = {};
    try {
      sessionsData = JSON.parse(content);
    } catch (error) {
      console.warn(`无法解析代理 ${agentId} 的sessions.json:`, error.message);
      return res.json({
        success: true,
        agentId: agentId,
        sessions: [],
        count: 0,
        note: '会话数据解析失败'
      });
    }
    
    // 转换格式为前端友好格式
    const sessions = Object.entries(sessionsData).map(([sessionKey, sessionInfo]) => {
      const match = sessionKey.match(/^agent:([^:]+):(.+)$/);
      const keyAgentId = match ? match[1] : 'unknown';
      const sessionLabel = match ? match[2] : sessionKey;
      
      return {
        sessionKey: sessionKey,
        sessionId: sessionInfo.sessionId,
        label: sessionInfo.customLabel || sessionLabel,
        agentId: keyAgentId,
        updatedAt: sessionInfo.updatedAt,
        messageCount: 0, // 可以通过读取文件计算
        model: sessionInfo.model || 'unknown',
        lastActive: sessionInfo.updatedAt ? new Date(sessionInfo.updatedAt).toLocaleString() : '从未'
      };
    });
    
    res.json({
      success: true,
      agentId: agentId,
      sessions: sessions,
      count: sessions.length
    });
    
  } catch (error) {
    console.error('获取代理会话列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 删除会话
 */
app.delete('/api/sessions/:sessionKey', async (req, res) => {
  try {
    const { sessionKey } = req.params;
    const { agentId = 'main' } = req.query;
    
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const sessionsJsonPath = path.join(stateDir, 'agents', agentId, 'sessions', 'sessions.json');
    
    // 读取sessions.json
    if (!fs.existsSync(sessionsJsonPath)) {
      return res.status(404).json({
        success: false,
        error: 'sessions.json文件不存在'
      });
    }
    
    const content = fs.readFileSync(sessionsJsonPath, 'utf8');
    let sessionsData = {};
    try {
      sessionsData = JSON.parse(content);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: '无法解析sessions.json文件'
      });
    }
    
    // 查找会话
    const fullKey = `agent:${agentId}:${sessionKey}`;
    const sessionEntry = sessionsData[fullKey];
    
    if (!sessionEntry) {
      return res.status(404).json({
        success: false,
        error: `会话 ${sessionKey} 不存在`
      });
    }
    
    // 删除会话文件
    const sessionFilePath = sessionEntry.sessionFile;
    if (fs.existsSync(sessionFilePath)) {
      fs.unlinkSync(sessionFilePath);
    }
    
    // 从sessions.json中移除
    delete sessionsData[fullKey];
    
    // 写回文件
    fs.writeFileSync(sessionsJsonPath, JSON.stringify(sessionsData, null, 2), 'utf8');
    
    res.json({
      success: true,
      deletedSession: {
        sessionKey: sessionKey,
        sessionId: sessionEntry.sessionId,
        agentId: agentId
      },
      message: '会话删除成功'
    });
    
  } catch (error) {
    console.error('删除会话失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 重命名会话
 */
app.put('/api/sessions/:sessionKey', async (req, res) => {
  try {
    const { sessionKey } = req.params;
    const { newLabel, agentId = 'main' } = req.body;
    
    if (!newLabel || typeof newLabel !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少newLabel参数或格式不正确'
      });
    }
    
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const sessionsJsonPath = path.join(stateDir, 'agents', agentId, 'sessions', 'sessions.json');
    
    // 读取sessions.json
    if (!fs.existsSync(sessionsJsonPath)) {
      return res.status(404).json({
        success: false,
        error: 'sessions.json文件不存在'
      });
    }
    
    const content = fs.readFileSync(sessionsJsonPath, 'utf8');
    let sessionsData = {};
    try {
      sessionsData = JSON.parse(content);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: '无法解析sessions.json文件'
      });
    }
    
    // 查找旧会话
    const oldFullKey = `agent:${agentId}:${sessionKey}`;
    const sessionEntry = sessionsData[oldFullKey];
    
    if (!sessionEntry) {
      return res.status(404).json({
        success: false,
        error: `会话 ${sessionKey} 不存在`
      });
    }
    
    // 检查新名称是否唯一
    let newSessionKey = newLabel;
    const existingKeys = Object.keys(sessionsData);
    let counter = 1;
    while (existingKeys.includes(`agent:${agentId}:${newSessionKey}`) && newSessionKey !== sessionKey) {
      newSessionKey = `${newLabel}-${counter}`;
      counter++;
    }
    
    // 更新customLabel字段
    sessionEntry.customLabel = newLabel;
    sessionEntry.updatedAt = Date.now();
    
    // 如果key发生变化，需要移动条目
    if (newSessionKey !== sessionKey) {
      // 移除旧key
      delete sessionsData[oldFullKey];
      // 添加新key
      sessionsData[`agent:${agentId}:${newSessionKey}`] = sessionEntry;
    } else {
      // 更新现有条目
      sessionsData[oldFullKey] = sessionEntry;
    }
    
    // 写回文件
    fs.writeFileSync(sessionsJsonPath, JSON.stringify(sessionsData, null, 2), 'utf8');
    
    res.json({
      success: true,
      renamedSession: {
        oldKey: sessionKey,
        newKey: newSessionKey,
        newLabel: newLabel,
        sessionId: sessionEntry.sessionId,
        agentId: agentId
      },
      message: '会话重命名成功'
    });
    
  } catch (error) {
    console.error('重命名会话失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取会话详情
 */
app.get('/api/sessions/:sessionKey/details', async (req, res) => {
  try {
    const { sessionKey } = req.params;
    const { agentId = 'main' } = req.query;
    
    const stateDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const sessionsJsonPath = path.join(stateDir, 'agents', agentId, 'sessions', 'sessions.json');
    
    // 读取sessions.json
    if (!fs.existsSync(sessionsJsonPath)) {
      return res.status(404).json({
        success: false,
        error: 'sessions.json文件不存在'
      });
    }
    
    const content = fs.readFileSync(sessionsJsonPath, 'utf8');
    let sessionsData = {};
    try {
      sessionsData = JSON.parse(content);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: '无法解析sessions.json文件'
      });
    }
    
    // 查找会话
    const fullKey = `agent:${agentId}:${sessionKey}`;
    const sessionEntry = sessionsData[fullKey];
    
    if (!sessionEntry) {
      return res.status(404).json({
        success: false,
        error: `会话 ${sessionKey} 不存在`
      });
    }
    
    // 计算消息数量
    let messageCount = 0;
    if (sessionEntry.sessionFile && fs.existsSync(sessionEntry.sessionFile)) {
      try {
        const fileContent = fs.readFileSync(sessionEntry.sessionFile, 'utf8');
        const lines = fileContent.trim().split('\n').filter(line => line.trim());
        messageCount = lines.length;
      } catch (error) {
        console.warn('无法读取会话文件:', error.message);
      }
    }
    
    res.json({
      success: true,
      session: {
        sessionKey: sessionKey,
        sessionId: sessionEntry.sessionId,
        label: sessionEntry.customLabel || sessionKey,
        agentId: agentId,
        updatedAt: sessionEntry.updatedAt,
        messageCount: messageCount,
        model: sessionEntry.model || 'unknown',
        filePath: sessionEntry.sessionFile,
        exists: fs.existsSync(sessionEntry.sessionFile || '')
      }
    });
    
  } catch (error) {
    console.error('获取会话详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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
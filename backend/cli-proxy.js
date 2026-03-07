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

/**
 * 清理字符串中的非法UTF-8字符和JSON特殊字符
 * 简化版本：只做最基本的清理，避免过度处理
 */
function cleanString(str) {
  if (typeof str !== 'string') return str;
  
  // 第一步：移除所有ANSI转义序列（包括完整和不完整的）
  let cleaned = str
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // 移除完整的ANSI转义序列 (\x1b[)
    .replace(/\[[0-9;]*[a-zA-Z]/g, '')      // 移除不完整的ANSI转义序列 ([7m, [0m等)
    .replace(/\uFFFD/g, '')                 // 移除Unicode替换字符 �
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // 移除控制字符
  
  // 第二步：修复已知的ANSI转义码污染模式
  // 这些是OpenClaw 2026.3.2在Windows上可能产生的问题
  cleaned = cleaned.replace(/agent:main:\[7m/g, 'agent:main:');
  cleaned = cleaned.replace(/\[0m��"/g, '会话"');
  cleaned = cleaned.replace(/\[0m��/g, '会话');
  cleaned = cleaned.replace(/�»�/g, '新会');
  
  // 第三步：修复特定的乱码模式
  // 修复"未命名会�?"模式（API响应中出现的）
  cleaned = cleaned.replace(/未命名会�\?/g, '未命名会话');
  cleaned = cleaned.replace(/未命名会[^\w\u4e00-\u9fa5]{0,3}/g, '未命名会话');
  
  // 修复"新会�?"模式（第二个会话的originalKey字段）
  cleaned = cleaned.replace(/新会�\?/g, '新会话');
  cleaned = cleaned.replace(/新会[^\w\u4e00-\u9fa5]{0,3}/g, '新会话');
  
  // 修复"测试会�?"模式
  cleaned = cleaned.replace(/测试会�\?/g, '测试会话');
  cleaned = cleaned.replace(/测试会[^\w\u4e00-\u9fa5]{0,3}/g, '测试会话');
  
  // 更通用的清理：任何"未命名会"后面跟着非中文字符/字母数字的，都替换为"未命名会话"
  cleaned = cleaned.replace(/未命名会[^"\w\u4e00-\u9fa5]{0,5}/g, '未命名会话');
  
  // 更通用的清理：任何"新会"后面跟着非中文字符/字母数字的，都替换为"新会话"
  cleaned = cleaned.replace(/新会[^"\w\u4e00-\u9fa5]{0,5}/g, '新会话');
  
  // 更通用的清理：任何"测试会"后面跟着非中文字符/字母数字的，都替换为"测试会话"
  cleaned = cleaned.replace(/测试会[^"\w\u4e00-\u9fa5]{0,5}/g, '测试会话');
  
  // 最后确保：如果还有"新会"但不以"话"结尾，修复它
  if (cleaned.includes('新会') && !cleaned.includes('新会话')) {
    cleaned = cleaned.replace(/新会[^"\r\n]{0,3}/g, '新会话');
  }
  
  // 最后确保：如果还有"未命名会"但不以"话"结尾，修复它
  if (cleaned.includes('未命名会') && !cleaned.includes('未命名会话')) {
    cleaned = cleaned.replace(/未命名会[^"\r\n]{0,3}/g, '未命名会话');
  }
  
  // 修复希腊字母和越南语字符乱码模式（OpenClaw 2026.3.2编码问题）
  // 模式1: δ�����Ự → 未命名会话
  cleaned = cleaned.replace(/δ[^\w\u4e00-\u9fa5]{0,5}Ự/g, '未命名会话');
  cleaned = cleaned.replace(/δ/g, '未命名');
  cleaned = cleaned.replace(/Ự/g, '会话');
  
  // 修复替换字符(�)乱码
  cleaned = cleaned.replace(/[�]{2,}/g, ''); // 移除连续多个�字符
  cleaned = cleaned.replace(/�+/g, ''); // 移除所有�
  
  // 修复���ԻỰ模式 → 测试会话
  // 注意：以下两行会破坏JSON结构，暂时注释掉
  // cleaned = cleaned.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]{3,}Ự/g, '测试会话');
  // cleaned = cleaned.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]{3,}/g, '测试');
  
  // 第四步：只做最基本的字符过滤，保留所有有效字符
  // 允许所有Unicode字符（包括中文），只移除真正的控制字符
  // 注意：这里我们不做过度的字符过滤，避免移除有效字符
  return cleaned;
}

/**
 * 清理JSON字符串中的非法字符，使其可解析
 */
function cleanJSON(jsonString) {
  try {
    // 先尝试直接解析
    return JSON.parse(jsonString);
  } catch (error) {
    console.log('JSON解析失败，尝试清理...');
    
    // 逐步清理JSON字符串
    let cleaned = jsonString;
    
    // 1. 移除BOM字符
    cleaned = cleaned.replace(/^\uFEFF/, '');
    
    // 2. 修复字段值中的未转义控制字符
    cleaned = cleaned.replace(/(?<=":[^"]*)[\x00-\x1F](?=[^"]*")/g, '');
    
    // 3. 修复字段值中的非法UTF-8序列
    cleaned = cleaned.replace(/(?<=":[^"]*)[^\x00-\x7F\u4e00-\u9fa5](?=[^"]*")/g, '');
    
    // 4. 修复常见的乱码模式
    cleaned = cleaned.replace(/新会�\?/g, '新会话');
    cleaned = cleaned.replace(/测试会�\?/g, '测试会话');
    
    // 5. 确保字符串正确闭合
    const openBraces = (cleaned.match(/\{/g) || []).length;
    const closeBraces = (cleaned.match(/\}/g) || []).length;
    
    if (openBraces > closeBraces) {
      cleaned += '}'.repeat(openBraces - closeBraces);
    }
    
    try {
      return JSON.parse(cleaned);
    } catch (secondError) {
      console.error('二次JSON解析失败:', secondError.message);
      
      // 最后手段：逐行解析
      const lines = cleaned.split('\n').filter(line => line.trim().length > 0);
      const jsonLines = [];
      
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          jsonLines.push(obj);
        } catch (lineError) {
          // 跳过无法解析的行
        }
      }
      
      if (jsonLines.length > 0) {
        console.log(`成功解析 ${jsonLines.length} 行JSON数据`);
        return jsonLines[0]; // 返回第一个有效JSON对象
      }
      
      throw new Error(`无法修复JSON: ${error.message}`);
    }
  }
}

/**
 * 直接读取OpenClaw会话文件，避免CLI命令的编码问题
 * @param {string} agentId - 可选，代理ID过滤，如'main'
 */
async function readSessionsFromFile(agentId = null) {
  // 确定要读取的代理ID，默认为'main'
  const targetAgentId = agentId || 'main';
  const sessionsPath = path.join(process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw', 'agents', targetAgentId, 'sessions', 'sessions.json');
  console.log(`直接读取会话文件 (代理: ${targetAgentId}): ${sessionsPath}`);
  
  try {
    // 直接读取文件内容
    const fileContent = await fs.promises.readFile(sessionsPath, { encoding: 'utf-8' });
    
    // 清理文件内容中的非法字符
    const cleanedContent = cleanString(fileContent);
    
    try {
      // 解析JSON
      const sessionsData = cleanJSON(cleanedContent);
      
      // 转换格式，适配前端API
      const transformedSessions = [];
      let sessionCount = 0;
      
      // sessions.json文件结构：{"agent:main:main": {...}, "agent:main:新会话": {...}, ...}
      // 需要转换为数组格式
      for (const [key, sessionData] of Object.entries(sessionsData)) {
        try {
          // 提取代理ID从key中
          const agentKeyParts = cleanString(key).split(':');
          const sessionAgentId = agentKeyParts.length >= 2 ? agentKeyParts[1] : (sessionData.agentId || 'main');
          
          // 如果指定了agentId过滤，且会话不属于该代理，则跳过
          if (agentId && sessionAgentId !== agentId) {
            continue;
          }
          
          sessionCount++;
          
          // 深度清理键名
          let cleanedKey = cleanString(key);
          
          // 特殊处理：修复已知的乱码模式
          // 1. 修复ANSI转义码和乱码混合的键名
          if (cleanedKey.includes('�') || cleanedKey.includes('[')) {
            // 尝试提取可能的有效部分
            // 匹配 "agent:main:" 后面的部分
            const keyMatch = cleanedKey.match(/agent:main:(.+)/);
            if (keyMatch && keyMatch[1]) {
              const sessionName = keyMatch[1];
              // 尝试推断正确的会话名称
              if (sessionName.includes('�') || sessionName.includes('»')) {
                // 这可能是"新会话"或"测试会话"的乱码
                if (sessionName.includes('新') || sessionName.includes('�»�')) {
                  cleanedKey = cleanedKey.replace(/agent:main:[^\w\u4e00-\u9fa5]*/, 'agent:main:新会话');
                } else if (sessionName.includes('测试') || sessionName.includes('测试会')) {
                  cleanedKey = cleanedKey.replace(/agent:main:[^\w\u4e00-\u9fa5]*/, 'agent:main:测试会话');
                }
              }
            }
          }
          
          // 从清理后的key中提取有意义的标签
          let label = '未命名会话';
          const keyParts = cleanedKey.split(':');
          if (keyParts.length >= 3) {
            const lastPart = keyParts[keyParts.length - 1];
            if (lastPart && lastPart !== 'main' && !lastPart.startsWith('oc_')) {
              label = cleanString(lastPart);
            }
          }
          
          // 如果sessionData中有customLabel，使用它
          if (sessionData.customLabel) {
            label = cleanString(sessionData.customLabel);
          }
          
          // 主动修复常见的乱码模式
          if (label.includes('δ����') || label.includes('δ�����') || label.includes('δ')) {
            label = '未命名会话';
          }
          if (label.includes('���ԻỰ') || label.includes('测试会')) {
            // 尝试保留"测试"部分，修复乱码
            label = label.replace(/���ԻỰ/g, '测试会话');
            label = label.replace(/[^\w\u4e00-\u9fa5]/g, '');
            if (label === '') label = '测试会话';
          }
          if (label.includes('�»Ự')) {
            label = label.replace(/�»Ự/g, '新会话');
            label = label.replace(/[^\w\u4e00-\u9fa5]/g, '');
            if (label === '') label = '新会话';
          }
          
          // 检测乱码：如果包含Unicode替换字符(�)或希腊字母等非常见字符
          if (label.includes('�') || label.includes('δ') || label.includes('Ự')) {
            // 基于原始key推断可能的正确标签
            if (cleanedKey.includes('main')) {
              label = '主会话';
            } else if (cleanedKey.includes('feishu')) {
              label = '飞书会话';
            } else if (cleanedKey.includes('test') || cleanedKey.includes('测试')) {
              label = '测试会话';
            } else if (cleanedKey.includes('new') || cleanedKey.includes('新')) {
              label = '新会话';
            } else {
              label = '未命名会话';
            }
          }
          
          // 最终清理：移除所有非字母数字和中文字符
          label = label.replace(/[^\w\u4e00-\u9fa5]/g, '');
          if (label === '') label = '未命名会话';
          
          // 构建安全的会话对象
          const safeSession = {
            sessionKey: sessionData.sessionId || cleanedKey,
            sessionId: sessionData.sessionId || '',
            originalKey: cleanedKey,
            label: label,
            agentId: sessionData.agentId || 'main',
            lastMessageAt: new Date(sessionData.updatedAt || Date.now()).toISOString(),
            messageCount: sessionData.inputTokens ? Math.floor(sessionData.inputTokens / 10) : 0,
            model: sessionData.model || 'unknown',
            ageMs: sessionData.ageMs || 0
          };
          
          transformedSessions.push(safeSession);
        } catch (sessionError) {
          console.warn(`处理会话 ${key} 时出错: ${sessionError.message}`);
        }
      }
      
      return {
        success: true,
        sessions: transformedSessions,
        count: sessionCount,
        total: sessionCount
      };
    } catch (parseError) {
      console.error('解析会话文件JSON失败:', parseError);
      throw new Error(`解析会话文件失败: ${parseError.message}`);
    }
  } catch (fileError) {
    console.error('读取会话文件失败:', fileError);
    throw new Error(`无法读取会话文件: ${fileError.message}`);
  }
}

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
    // 修复Windows编码问题：设置控制台代码页为UTF-8 (65001)
    // 这是根本解决中文乱码问题的关键
    const fixedCmd = `chcp 65001 >nul && ${cmd}`;
    console.log(`执行命令: ${fixedCmd}`);
    
    exec(fixedCmd, { 
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeout,
      encoding: 'utf8',
      shell: 'cmd.exe'  // 使用cmd.exe确保chcp命令正常工作
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
 * 根路径 - 提供API服务信息
 */
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    success: true,
    service: 'OpenClaw CLI代理服务',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      sessions: '/api/sessions',
      sendMessage: '/api/sessions/:sessionKey/messages',
      sessionHistory: '/api/sessions/:sessionKey/history'
    },
    message: '请访问 /health 检查服务状态，或访问前端界面 http://localhost:3003/fixed-dashboard.html'
  });
});

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
    // 获取查询参数
    const agentId = req.query.agent || req.query.agentId || null;
    console.log(`使用直接文件读取方式获取会话数据${agentId ? ` (代理: ${agentId})` : ''}...`);
    
    // 方法1：尝试直接文件读取
    try {
      const fileResult = await readSessionsFromFile(agentId);
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({
        success: true,
        data: {
          sessions: fileResult.sessions,
          count: fileResult.count,
          total: fileResult.total
        },
        count: fileResult.count,
        source: 'file'  // 标识数据来源
      });
      return;
    } catch (fileError) {
      console.warn('直接文件读取失败，回退到CLI命令:', fileError.message);
    }
    
    // 方法2：回退到CLI命令（兼容性）
    const output = await runCommand('openclaw sessions --json --no-color');
    
    try {
      // 第一步：彻底清理输出字符串
      const cleanedOutput = cleanString(output);
      console.log(`清理后输出长度: ${cleanedOutput.length}, 原始长度: ${output.length}`);
      
      // 第二步：尝试解析清理后的JSON
      const result = cleanJSON(cleanedOutput);
      
      // 第三步：转换会话数据字段名，适配前端代码
      const sessions = result.sessions || [];
      
      // 如果指定了代理ID，过滤会话
      let filteredSessions = sessions;
      if (agentId) {
        filteredSessions = sessions.filter(session => {
          const sessionAgentId = session.agentId || 'main';
          return sessionAgentId === agentId;
        });
        console.log(`代理过滤: 从${sessions.length}个会话中过滤出${filteredSessions.length}个属于代理"${agentId}"的会话`);
      }
      
      const transformedSessions = filteredSessions.map(session => {
        // 清理所有字段，确保没有乱码字符
        const cleanKey = cleanString(session.key || '');
        const cleanSessionId = cleanString(session.sessionId || '');
        const cleanAgentId = cleanString(session.agentId || 'main');
        const cleanModel = cleanString(session.model || 'unknown');
        
        // 提取标签，确保清理乱码
        let label = cleanString(session.label || session.agentId || '未命名会话');
        if (!session.label && cleanKey) {
          const keyParts = cleanKey.split(':');
          if (keyParts.length >= 3) {
            const lastPart = keyParts[keyParts.length - 1];
            if (lastPart && lastPart !== 'main' && !lastPart.startsWith('oc_')) {
              label = cleanString(lastPart);
            }
          }
        }
        
        // 关键修复：使用 sessionId 作为发送消息的标识符
        // key字段是"agent:main:main"格式，不能用于--session-id参数
        // sessionId字段是UUID格式，才是正确的参数
        return {
          sessionKey: cleanSessionId || cleanKey, // 优先使用sessionId
          sessionId: cleanSessionId, // 保留原始sessionId
          originalKey: cleanKey, // 清理后的key
          label: label,
          agentId: cleanAgentId,
          lastMessageAt: new Date(session.updatedAt || Date.now()).toISOString(),
          messageCount: session.inputTokens ? Math.floor(session.inputTokens / 10) : 0, // 估算消息数
          model: cleanModel,
          ageMs: session.ageMs || 0,
          // 保留原始数据（清理后的）
          ...session,
          key: cleanKey,
          sessionId: cleanSessionId,
          agentId: cleanAgentId,
          model: cleanModel
        };
      });
      
      // 设置响应头确保UTF-8编码
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
    const cmd = `openclaw agent --session-id ${sessionId} --message "${escapedMessage}" --local --json --no-color`;
    
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
 * 删除会话 - 直接操作文件系统
 */
app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const agentId = req.query.agentId || 'main';
    
    console.log(`删除会话 ${sessionId} (代理: ${agentId})`);
    
    const baseDir = process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw';
    const sessionsJsonPath = path.join(baseDir, 'agents', agentId, 'sessions', 'sessions.json');
    const sessionFilePath = path.join(baseDir, 'agents', agentId, 'sessions', `${sessionId}.jsonl`);
    
    console.log(`会话文件路径: ${sessionFilePath}`);
    console.log(`会话索引文件: ${sessionsJsonPath}`);
    
    let results = {
      sessionFileDeleted: false,
      sessionFileExists: false,
      sessionRemovedFromIndex: false,
      sessionFoundInIndex: false
    };
    
    // 1. 删除会话文件
    if (fs.existsSync(sessionFilePath)) {
      results.sessionFileExists = true;
      try {
        fs.unlinkSync(sessionFilePath);
        results.sessionFileDeleted = true;
        console.log(`✅ 已删除会话文件: ${sessionFilePath}`);
      } catch (fileError) {
        console.error(`删除会话文件失败: ${fileError.message}`);
        // 继续执行，尝试从索引中移除
      }
    } else {
      console.log(`⚠️ 会话文件不存在: ${sessionFilePath}`);
    }
    
    // 2. 从sessions.json中移除会话条目
    if (fs.existsSync(sessionsJsonPath)) {
      try {
        const sessionsJsonContent = fs.readFileSync(sessionsJsonPath, 'utf8');
        const cleanedContent = cleanString(sessionsJsonContent);
        const sessionsData = cleanJSON(cleanedContent);
        
        // 查找并删除对应的会话条目
        let sessionKeyToRemove = null;
        for (const [key, sessionData] of Object.entries(sessionsData)) {
          if (sessionData.sessionId === sessionId) {
            sessionKeyToRemove = key;
            results.sessionFoundInIndex = true;
            break;
          }
        }
        
        if (sessionKeyToRemove) {
          delete sessionsData[sessionKeyToRemove];
          // 写回文件
          fs.writeFileSync(sessionsJsonPath, JSON.stringify(sessionsData, null, 2), 'utf8');
          results.sessionRemovedFromIndex = true;
          console.log(`✅ 已从索引中移除会话: ${sessionKeyToRemove}`);
        } else {
          console.log(`⚠️ 会话 ${sessionId} 未在索引中找到`);
        }
      } catch (jsonError) {
        console.error(`更新sessions.json失败: ${jsonError.message}`);
        // 继续执行，至少文件可能已被删除
      }
    } else {
      console.log(`⚠️ 会话索引文件不存在: ${sessionsJsonPath}`);
    }
    
    // 判断删除是否成功
    const success = results.sessionFileDeleted || results.sessionRemovedFromIndex;
    
    if (success) {
      res.json({
        success: true,
        message: '会话删除成功',
        sessionId: sessionId,
        agentId: agentId,
        results: results
      });
    } else {
      // 如果文件不存在且索引中也没有找到，也算成功（可能已被删除）
      if (!results.sessionFileExists && !results.sessionFoundInIndex) {
        res.json({
          success: true,
          message: '会话不存在或已被删除',
          sessionId: sessionId,
          agentId: agentId,
          results: results,
          note: '会话文件或索引条目均未找到，可能已被删除'
        });
      } else {
        res.status(500).json({
          success: false,
          error: '无法删除会话',
          sessionId: sessionId,
          agentId: agentId,
          results: results,
          details: '文件系统和索引操作均未成功'
        });
      }
    }
  } catch (error) {
    console.error('删除会话失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: '删除会话时发生意外错误'
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
    const agentId = req.query.agent || req.query.agentId || 'main';
    
    const result = await getSessionMessages(sessionKey, limit, agentId);
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
    const agentId = req.query.agent || req.query.agentId || 'main';
    
    console.log(`获取会话消息: ${sessionId}, 代理: ${agentId}, 限制: ${limit}`);
    
    const result = await getSessionMessages(sessionId, limit, agentId);
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
 * @param {string} sessionId - 会话ID (UUID格式)
 * @param {number} limit - 限制返回消息数量
 * @param {string} agentId - 代理ID，默认为'main'
 */
async function getSessionMessages(sessionId, limit = 50, agentId = 'main') {
  // 根据代理ID构建可能的消息文件路径
  const possiblePaths = [];
  
  // 路径1: ~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl
  possiblePaths.push(
    path.join(
      process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw',
      'agents',
      agentId,
      'sessions',
      `${sessionId}.jsonl`
    )
  );
  
  // 路径2: ~/.openclaw/agents/<agentId>/sessions/<sessionId>/messages.jsonl
  possiblePaths.push(
    path.join(
      process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw',
      'agents',
      agentId,
      'sessions',
      sessionId,
      'messages.jsonl'
    )
  );
  
  // 路径3: ~/.openclaw/sessions/<sessionId>/messages.jsonl (旧版路径)
  possiblePaths.push(
    path.join(
      process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw',
      'sessions',
      sessionId,
      'messages.jsonl'
    )
  );
  
  // 路径4: ~/.openclaw/agents/main/sessions/<sessionId>.jsonl (回退到main代理)
  if (agentId !== 'main') {
    possiblePaths.push(
      path.join(
        process.env.OPENCLAW_STATE_DIR || 'C:/Users/admin/.openclaw',
        'agents',
        'main',
        'sessions',
        `${sessionId}.jsonl`
      )
    );
  }
  
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
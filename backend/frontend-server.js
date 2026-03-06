/**
 * 简单的前端HTTP服务器
 * 端口：3003
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.FRONTEND_PORT || 3003;

// MIME类型映射
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  
  // 解析请求URL
  const parsedUrl = url.parse(req.url);
  let pathname = `.${parsedUrl.pathname}`;
  
  // 默认页面
  if (pathname === './' || pathname === './index.html') {
    pathname = './simple-dashboard.html';
  }
  
  // 获取文件扩展名
  const extname = path.extname(pathname);
  let contentType = mimeTypes[extname] || 'application/octet-stream';
  
  // 检查文件是否存在
  fs.exists(pathname, (exists) => {
    if (!exists) {
      // 文件不存在，返回404
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - 文件未找到</h1>', 'utf-8');
      return;
    }
    
    // 如果是目录，列出文件
    if (fs.statSync(pathname).isDirectory()) {
      fs.readdir(pathname, (err, files) => {
        if (err) {
          res.writeHead(500);
          return res.end(`服务器错误: ${err.code}`);
        }
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        const fileList = files.map(file => `<li><a href="${path.join(parsedUrl.pathname, file)}">${file}</a></li>`).join('');
        res.end(`
          <html>
            <head><title>目录列表</title></head>
            <body>
              <h1>目录: ${pathname}</h1>
              <ul>${fileList}</ul>
            </body>
          </html>
        `, 'utf-8');
      });
      return;
    }
    
    // 读取文件内容
    fs.readFile(pathname, (error, content) => {
      if (error) {
        res.writeHead(500);
        res.end(`服务器错误: ${error.code}`);
      } else {
        // 设置CORS头，允许前端访问CLI代理
        const headers = {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        };
        
        res.writeHead(200, headers);
        res.end(content, 'utf-8');
      }
    });
  });
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log('🚀 前端HTTP服务器已启动');
  console.log(`📍 地址: http://localhost:${PORT}`);
  console.log(`📄 主界面: http://localhost:${PORT}/simple-dashboard.html`);
  console.log(`🔧 静态文件服务已启用`);
  console.log('========================================');
  
  // 显示可用文件
  fs.readdir('.', (err, files) => {
    if (!err) {
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      if (htmlFiles.length > 0) {
        console.log('📁 可访问的HTML文件:');
        htmlFiles.forEach(file => {
          console.log(`   • http://localhost:${PORT}/${file}`);
        });
      }
    }
  });
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

module.exports = server;
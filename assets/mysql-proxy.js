/**
 * MySQL HTTP 代理服务器
 * 
 * 部署在你的服务器上（非 Cloudflare Worker）
 * 接收 Worker 请求，查询 MySQL 返回 JSON 数据
 * 
 * 使用方法：
 * 1. 修改下面的 MySQL 连接配置
 * 2. 运行: node mysql-proxy.js
 * 3. 在 Worker 配置中填入代理地址: https://your-server:3000/api
 */

const http = require('http');
const https = require('https');
const { createConnection } = require('mysql2/promise');

// ============ 配置 ============
const PORT = process.env.PROXY_PORT || 3000;
const ALLOWED_IPS = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : []; // 留空表示允许所有

// MySQL 连接配置（从草料控制台获取）
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'cli_xxxxxxx',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'cli_xxxxxxx',
  connectTimeout: 10000,
  connectionLimit: 5
};

// 可用的表列表（草料官方数据库表）
const AVAILABLE_TABLES = [
  { name: 'base_codeinfo', comment: '码信息表' },
  { name: 'code_state', comment: '码状态表' },
  { name: 'code_state_log', comment: '码状态日志' },
  { name: 'base_table_data', comment: '表单数据' },
  { name: 'base_task', comment: '任务表' },
  { name: 'code_task_log', comment: '任务日志' },
  { name: 'record_review_data', comment: '审核数据' },
  { name: 'code_tags', comment: '码标签' },
  { name: 'base_members', comment: '成员表' },
  { name: 'base_auth_msg', comment: '授权信息' },
  { name: 'record_audit_data', comment: '审核记录' }
];
// ================================

let connectionPool = null;

async function getPool() {
  if (!connectionPool) {
    connectionPool = await createConnection(MYSQL_CONFIG);
  }
  return connectionPool;
}

async function queryTable(table, pageToken = '', maxPageSize = 100) {
  const conn = await getPool();
  
  // 验证表名安全
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
  if (!safeTable) throw new Error('Invalid table name');
  
  // 获取总记录数
  const [countResult] = await conn.query(`SELECT COUNT(*) as total FROM \`${safeTable}\``);
  const total = countResult[0].total;
  
  // 分页查询
  const offset = parseInt(pageToken) || 0;
  const limit = Math.min(parseInt(maxPageSize) || 100, 1000);
  const [rows] = await conn.query(`SELECT * FROM \`${safeTable}\` LIMIT ${offset}, ${limit}`);
  
  const nextOffset = offset + rows.length;
  const hasMore = nextOffset < total;
  
  return {
    success: true,
    nextPageToken: hasMore ? String(nextOffset) : '',
    hasMore,
    total,
    records: rows.map((row, index) => ({
      primaryID: String(offset + index + 1),
      data: row
    }))
  };
}

async function testConnection() {
  try {
    const conn = await getPool();
    await conn.query('SELECT 1');
    return { success: true, message: 'MySQL connected' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // IP 白名单检查
  if (ALLOWED_IPS.length > 0) {
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!ALLOWED_IPS.includes(clientIP)) {
      res.writeHead(403);
      res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
      return;
    }
  }
  
  if (req.url !== '/api') {
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, message: 'Not found' }));
    return;
  }
  
  try {
    const body = await parseBody(req);
    const action = body.action || 'test';
    
    switch (action) {
      case 'test': {
        const result = await testConnection();
        if (result.success) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, code: 0, message: '连接成功', tables: AVAILABLE_TABLES }));
        } else {
          res.writeHead(500);
          res.end(JSON.stringify(result));
        }
        break;
      }
      case 'query': {
        const table = body.table || 'base_codeinfo';
        const result = await queryTable(table, body.pageToken, body.maxPageSize);
        res.writeHead(200);
        res.end(JSON.stringify(result));
        break;
      }
      default:
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: 'Unknown action' }));
    }
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, message: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`MySQL Proxy running on port ${PORT}`);
  console.log(`Available tables: ${AVAILABLE_TABLES.length}`);
  console.log(`MySQL: ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`);
});

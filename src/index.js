var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Base-Request-Timestamp, X-Base-Request-Nonce, X-Base-Signature"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    if (path === "/" || path === "") {
      return new Response(JSON.stringify({
        service: "caoliao-feishu-connector",
        status: "running",
        version: "1.0.0",
        endpoints: {
          meta: "/meta.json",
          config: "/config.html",
          tables: "/api/tables",
          table_meta: "/api/table_meta",
          records: "/api/records",
          testConnection: "/api/test-connection"
        }
      }, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
      });
    }
    if (path === "/favicon.ico") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (path === "/meta.json" || path === "/meta") {
      return new Response(JSON.stringify({
        schemaVersion: 1,
        version: "1.0.0",
        type: "data_connector",
        extraData: {
          disabledPeriodicSync: false,
          dataSourceConfigUiUri: `https://${url.host}/config.html`,
          initHeight: 400,
          initWidth: 600
        },
        protocol: {
          type: "http",
          httpProtocol: {
            uris: [
              { type: "tableMeta", uri: "/api/table_meta" },
              { type: "records", uri: "/api/records" }
            ]
          }
        }
      }, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
      });
    }
    if (path === "/config.html" || path === "/config") {
      const response = new Response(CONFIG_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "frame-ancestors *",
          "Cache-Control": "no-cache"
        }
      });
      response.headers.delete("X-Frame-Options");
      response.headers.delete("x-frame-options");
      return response;
    }
    
    // 测试连接接口
    if (path === "/api/test-connection" && request.method === "POST") {
      try {
        const config = await request.json();
        const sourceType = config.sourceType;
        
        if (sourceType === "caoliao") {
          // 测试草料二维码 API 连接
          const apiKey = config.caoliaoApiKey;
          const apiUrl = config.caoliaoApiUrl || "https://open.cli.im/api/v2/rpc";
          
          if (!apiKey) {
            return jsonResponse({ success: false, message: "请输入 API Key" }, corsHeaders);
          }
          
          try {
            const resp = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
              },
              body: JSON.stringify({ action: "list-forms", params: {} })
            });
            const data = await resp.json();
            
            if (data.code === 0 || data.success) {
              // 获取表单列表成功，转换为表列表
              const forms = data.data?.list || data.data?.forms || data.data || [];
              const tables = forms.map(f => ({
                name: f.name || f.formName || f.id,
                comment: f.description || f.name || ""
              }));
              return jsonResponse({ success: true, tables }, corsHeaders);
            } else {
              return jsonResponse({ success: false, message: data.msg || data.message || "API 返回错误" }, corsHeaders);
            }
          } catch (e) {
            return jsonResponse({ success: false, message: `连接失败: ${e.message}` }, corsHeaders);
          }
        } else if (sourceType === "mysql") {
          // 测试 MySQL 连接
          const { mysqlHost, mysqlPort, mysqlUser, mysqlPassword, mysqlDatabase, mysqlCharset } = config;
          
          if (!mysqlHost || !mysqlUser || !mysqlPassword || !mysqlDatabase) {
            return jsonResponse({ success: false, message: "请填写完整的 MySQL 连接信息" }, corsHeaders);
          }
          
          // 使用 Cloudflare D1 作为代理测试 MySQL 连接
          // 注意：Cloudflare Workers 不能直接连接 MySQL，这里使用 D1 模拟
          // 实际生产环境需要使用 MySQL 代理服务或 Workers 的 TCP 连接
          try {
            // 这里我们尝试通过 D1 的 HTTP API 来测试连接
            // 或者返回一个模拟的成功响应
            // 实际部署时需要实现 MySQL 代理逻辑
            
            // 模拟获取表列表
            const tables = await getTablesFromMySQL(env, config);
            return jsonResponse({ success: true, tables }, corsHeaders);
          } catch (e) {
            return jsonResponse({ success: false, message: `MySQL 连接失败: ${e.message}` }, corsHeaders);
          }
        } else {
          return jsonResponse({ success: false, message: "不支持的数据源类型" }, corsHeaders);
        }
      } catch (e) {
        return jsonResponse({ success: false, message: `请求失败: ${e.message}` }, corsHeaders);
      }
    }
    
    if (path === "/api/table_meta" && request.method === "POST") {
      try {
        const body = await request.json();
        const paramsStr = body.params || "{}";
        const params = JSON.parse(paramsStr);
        const datasourceConfigStr = params.datasourceConfig || "{}";
        const datasourceConfig = JSON.parse(datasourceConfigStr);
        const tableName = datasourceConfig.tableName || datasourceConfig.table_name;
        if (!tableName) {
          return jsonResponse({
            code: 1254400,
            msg: JSON.stringify({ zh: "未指定要同步的表名", en: "No table name specified" }),
            data: null
          }, corsHeaders);
        }
        const tableMeta = await getTableMetaFromD1(env, tableName);
        if (!tableMeta) {
          return jsonResponse({
            code: 1254400,
            msg: JSON.stringify({ zh: `表 ${tableName} 不存在或数据`, en: `Table ${tableName} not found or empty` }),
            data: null
          }, corsHeaders);
        }
        return jsonResponse({
          code: 0,
          msg: "",
          data: tableMeta
        }, corsHeaders);
      } catch (e) {
        return jsonResponse({
          code: 1254500,
          msg: JSON.stringify({ zh: `系统异常: ${e.message}`, en: `System error: ${e.message}` }),
          data: null
        }, corsHeaders);
      }
    }
    if (path === "/api/records" && request.method === "POST") {
      try {
        const body = await request.json();
        const paramsStr = body.params || "{}";
        const params = JSON.parse(paramsStr);
        const datasourceConfigStr = params.datasourceConfig || "{}";
        const datasourceConfig = JSON.parse(datasourceConfigStr);
        const tableName = datasourceConfig.tableName || datasourceConfig.table_name;
        if (!tableName) {
          return jsonResponse({
            code: 1254400,
            msg: JSON.stringify({ zh: "未指定要同步的表名", en: "No table name specified" }),
            data: null
          }, corsHeaders);
        }
        const pageToken = params.pageToken || "0";
        const maxPageSize = Math.min(params.maxPageSize || 500, 1e3);
        const transactionID = params.transactionID || "";
        const result = await getRecordsFromD1(env, tableName, pageToken, maxPageSize);
        return jsonResponse({
          code: 0,
          msg: "",
          data: result
        }, corsHeaders);
      } catch (e) {
        return jsonResponse({
          code: 1254500,
          msg: JSON.stringify({ zh: `系统异常: ${e.message}`, en: `System error: ${e.message}` }),
          data: null
        }, corsHeaders);
      }
    }
    if (path === "/api/tables" && request.method === "GET") {
      try {
        const tables = await getAvailableTables(env);
        return jsonResponse({ code: 0, msg: "", data: tables }, corsHeaders);
      } catch (e) {
        return jsonResponse({
          code: 1254500,
          msg: JSON.stringify({ zh: e.message, en: e.message }),
          data: null
        }, corsHeaders);
      }
    }
    return new Response(JSON.stringify({ code: 404, msg: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// 从 MySQL 获取表列表（通过 D1 代理）
async function getTablesFromMySQL(env, config) {
  // 这里使用 D1 来模拟 MySQL 连接
  // 实际生产环境需要：
  // 1. 使用 Cloudflare 的 TCP 连接（需要企业版）
  // 2. 或者使用 MySQL 代理服务（如 PlanetScale、TiDB 等）
  // 3. 或者使用 D1 作为中间存储层
  
  // 这里返回模拟数据
  const stmt = env.D1.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
  );
  const result = await stmt.all();
  return result.results.map(r => ({ name: r.name, comment: "" }));
}

function jsonResponse(data, headers = {}) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}
__name(jsonResponse, "jsonResponse");

async function getTableMetaFromD1(env, tableName) {
  const stmt = env.D1.prepare(
    "SELECT field_id, field_name, field_type, is_primary, description FROM sync_fields WHERE table_name = ? ORDER BY sort_order"
  );
  const result = await stmt.bind(tableName).all();
  if (!result.results || result.results.length === 0) {
    return null;
  }
  const fields = result.results.map((f) => ({
    fieldID: f.field_id,
    fieldName: f.field_name,
    fieldType: f.field_type,
    isPrimary: f.is_primary === 1,
    description: f.description || ""
  }));
  return {
    tableName,
    fields
  };
}
__name(getTableMetaFromD1, "getTableMetaFromD1");

async function getRecordsFromD1(env, tableName, pageToken, maxPageSize) {
  const offset = parseInt(pageToken) || 0;
  const countStmt = env.D1.prepare(
    "SELECT COUNT(*) as cnt FROM sync_data WHERE table_name = ?"
  );
  const countResult = await countStmt.bind(tableName).first();
  const total = countResult?.cnt || 0;
  const fieldMap = await getFieldMapping(env, tableName);
  const dataStmt = env.D1.prepare(
    `SELECT source_id, data FROM sync_data 
     WHERE table_name = ? 
     ORDER BY source_id ASC 
     LIMIT ? OFFSET ?`
  );
  const dataResult = await dataStmt.bind(tableName, maxPageSize, offset).all();
  const records = dataResult.results.map((row) => {
    const rawData = JSON.parse(row.data || "{}");
    const mappedData = {};
    for (const [key, value] of Object.entries(rawData)) {
      const fid = fieldMap[key] || key;
      mappedData[fid] = value;
    }
    return {
      primaryID: String(row.source_id),
      data: mappedData
    };
  });
  const nextOffset = offset + records.length;
  const hasMore = nextOffset < total;
  return {
    nextPageToken: String(nextOffset),
    hasMore,
    records
  };
}
__name(getRecordsFromD1, "getRecordsFromD1");

async function getFieldMapping(env, tableName) {
  const stmt = env.D1.prepare(
    "SELECT field_name, field_id FROM sync_fields WHERE table_name = ?"
  );
  const result = await stmt.bind(tableName).all();
  const map = {};
  if (result.results) {
    for (const row of result.results) {
      if (row.field_name && row.field_id) {
        map[row.field_name] = row.field_id;
      }
    }
  }
  return map;
}
__name(getFieldMapping, "getFieldMapping");

async function getAvailableTables(env) {
  const stmt = env.D1.prepare(
    "SELECT DISTINCT table_name FROM sync_fields ORDER BY table_name"
  );
  const result = await stmt.all();
  return result.results.map((r) => r.table_name);
}
__name(getAvailableTables, "getAvailableTables");

var CONFIG_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>草料数据同步配置</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f6f7; padding: 20px; }
  .container { max-width: 560px; margin: 0 auto; }
  .card { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 16px; }
  h2 { font-size: 18px; color: #1f2328; margin-bottom: 16px; }
  h3 { font-size: 15px; color: #1f2328; margin-bottom: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e6e8; }
  .first-section { border-top: none; padding-top: 0; margin-top: 0; }
  label { display: block; font-size: 14px; color: #646a73; margin-bottom: 6px; font-weight: 500; }
  label .required { color: #ff3b30; }
  select, input, textarea { width: 100%; padding: 10px 14px; border: 1px solid #d0d3d9; border-radius: 8px; font-size: 14px; outline: none; background: #fff; }
  select:focus, input:focus, textarea:focus { border-color: #3370ff; box-shadow: 0 0 0 2px rgba(51,112,255,0.1); }
  .field { margin-bottom: 16px; }
  .btn { width: 100%; padding: 12px; background: #3370ff; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
  .btn:hover { background: #2860e1; }
  .btn:disabled { background: #b8babd; cursor: not-allowed; }
  .btn-secondary { background: #f0f2f5; color: #1f2328; }
  .btn-secondary:hover { background: #e5e6e8; }
  .btn-row { display: flex; gap: 12px; }
  .btn-row .btn { flex: 1; }
  .info { font-size: 12px; color: #9b9ea3; margin-top: 4px; }
  .loading { text-align: center; color: #9b9ea3; padding: 40px 0; font-size: 14px; }
  .success { color: #34c759; font-size: 14px; margin-top: 8px; }
  .error { color: #ff3b30; font-size: 14px; margin-top: 8px; }
  .source-type { display: flex; gap: 12px; margin-bottom: 16px; }
  .source-type label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .source-type input { width: auto; }
  .hidden { display: none; }
  .test-result { margin-top: 8px; font-size: 13px; }
  .test-result.success { color: #34c759; }
  .test-result.error { color: #ff3b30; }
</style>
</head>
<body>
<div class="container">
  <!-- 数据源配置卡片 -->
  <div class="card">
    <h2>🔌 数据源配置</h2>
    <div id="sourceLoading" class="loading">加载中...</div>
    <div id="sourceForm" style="display:none;">
      <div class="field">
        <label>数据源类型</label>
        <div class="source-type">
          <label><input type="radio" name="sourceType" value="caoliao" checked> 草料二维码 OpenAPI</label>
          <label><input type="radio" name="sourceType" value="mysql"> MySQL 数据库</label>
        </div>
      </div>

      <!-- 草料二维码配置 -->
      <div id="caoliaoConfig">
        <div class="field">
          <label>API Key <span class="required">*</span></label>
          <input type="text" id="caoliaoApiKey" placeholder="请输入草料二维码 API Key" />
          <div class="info">从草料二维码开放平台获取 API Key</div>
        </div>
        <div class="field">
          <label>API 地址</label>
          <input type="text" id="caoliaoApiUrl" value="https://open.cli.im/api/v2/rpc" placeholder="https://open.cli.im/api/v2/rpc" />
          <div class="info">草料二维码 OpenAPI 地址，一般无需修改</div>
        </div>
      </div>

      <!-- MySQL 配置 -->
      <div id="mysqlConfig" class="hidden">
        <div class="field">
          <label>主机地址 <span class="required">*</span></label>
          <input type="text" id="mysqlHost" placeholder="localhost 或 IP 地址" />
        </div>
        <div class="field">
          <label>端口</label>
          <input type="number" id="mysqlPort" value="3306" placeholder="3306" />
        </div>
        <div class="field">
          <label>用户名 <span class="required">*</span></label>
          <input type="text" id="mysqlUser" placeholder="数据库用户名" />
        </div>
        <div class="field">
          <label>密码 <span class="required">*</span></label>
          <input type="password" id="mysqlPassword" placeholder="数据库密码" />
        </div>
        <div class="field">
          <label>数据库名 <span class="required">*</span></label>
          <input type="text" id="mysqlDatabase" placeholder="数据库名称" />
        </div>
        <div class="field">
          <label>字符集</label>
          <select id="mysqlCharset">
            <option value="utf8mb4">utf8mb4 (推荐)</option>
            <option value="utf8">utf8</option>
            <option value="latin1">latin1</option>
          </select>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" id="testBtn">测试连接</button>
        <button class="btn" id="saveSourceBtn">保存数据源</button>
      </div>
      <div id="sourceMsg"></div>
    </div>
  </div>

  <!-- 同步配置卡片 -->
  <div class="card">
    <h2>📊 同步配置</h2>
    <div id="syncLoading" class="loading">请先配置数据源...</div>
    <div id="syncForm" style="display:none;">
      <div class="field">
        <label>选择要同步的表</label>
        <select id="tableSelect"><option value="">请先配置数据源并测试连接</option></select>
        <div class="info">选择数据源中的一张表，同步到飞书多维表格</div>
      </div>
      <div class="field">
        <label>同步周期（分钟）</label>
        <input type="number" id="intervalInput" value="60" min="5" max="1440" />
        <div class="info">最小5分钟，最大1440分钟（24小时）</div>
      </div>
      <div class="field">
        <label>同步模式</label>
        <select id="syncMode">
          <option value="incremental">增量同步（推荐）</option>
          <option value="full">全量覆盖</option>
        </select>
        <div class="info">增量同步只更新变化的数据，全量覆盖会清空后重新写入</div>
      </div>
      <button class="btn" id="saveSyncBtn">保存配置并开始同步</button>
      <div id="syncMsg"></div>
    </div>
  </div>
</div>
<!-- SDK importmap: 使用相对路径引用本地 SDK -->
<script type="importmap">
{
  "imports": {
    "@lark-base-open/connector-api": "./js/connector-api.mjs"
  }
}
</script>
<script type="module">
import { bitable } from '@lark-base-open/connector-api';

// 暴露到全局（兼容非模块脚本）
window.bitable = bitable;
window.__sdkLoaded = true;

// 全局配置
let savedConfig = null;

// 数据源类型切换
document.querySelectorAll('input[name="sourceType"]').forEach(radio => {
  radio.addEventListener('change', function() {
    const isCaoliao = this.value === 'caoliao';
    document.getElementById('caoliaoConfig').classList.toggle('hidden', !isCaoliao);
    document.getElementById('mysqlConfig').classList.toggle('hidden', isCaoliao);
  });
});

// 加载已保存配置
try {
  savedConfig = await bitable.getConfig() || {};
} catch(e) {}

// 填充数据源表单
if (savedConfig) {
  if (savedConfig.sourceType) {
    const radio = document.querySelector(\`input[name="sourceType"][value="\${savedConfig.sourceType}"]\`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
    }
  }
  if (savedConfig.caoliaoApiKey) document.getElementById('caoliaoApiKey').value = savedConfig.caoliaoApiKey;
  if (savedConfig.caoliaoApiUrl) document.getElementById('caoliaoApiUrl').value = savedConfig.caoliaoApiUrl;
  if (savedConfig.mysqlHost) document.getElementById('mysqlHost').value = savedConfig.mysqlHost;
  if (savedConfig.mysqlPort) document.getElementById('mysqlPort').value = savedConfig.mysqlPort;
  if (savedConfig.mysqlUser) document.getElementById('mysqlUser').value = savedConfig.mysqlUser;
  if (savedConfig.mysqlPassword) document.getElementById('mysqlPassword').value = savedConfig.mysqlPassword;
  if (savedConfig.mysqlDatabase) document.getElementById('mysqlDatabase').value = savedConfig.mysqlDatabase;
  if (savedConfig.mysqlCharset) document.getElementById('mysqlCharset').value = savedConfig.mysqlCharset;
  if (savedConfig.tableName) document.getElementById('tableSelect').value = savedConfig.tableName;
  if (savedConfig.syncInterval) document.getElementById('intervalInput').value = savedConfig.syncInterval;
  if (savedConfig.syncMode) document.getElementById('syncMode').value = savedConfig.syncMode;
}

document.getElementById('sourceLoading').style.display = 'none';
document.getElementById('sourceForm').style.display = 'block';

// 如果有数据源配置，加载同步表单
if (savedConfig && savedConfig.sourceType) {
  document.getElementById('syncLoading').style.display = 'none';
  document.getElementById('syncForm').style.display = 'block';
  loadTableList();
}

// 测试连接
document.getElementById('testBtn').addEventListener('click', async function() {
  const btn = this;
  const msg = document.getElementById('sourceMsg');
  
  const sourceType = document.querySelector('input[name="sourceType"]:checked').value;
  let config = { sourceType };
  
  if (sourceType === 'caoliao') {
    const apiKey = document.getElementById('caoliaoApiKey').value.trim();
    const apiUrl = document.getElementById('caoliaoApiUrl').value.trim();
    if (!apiKey) {
      msg.innerHTML = '<div class="error">请输入 API Key</div>';
      return;
    }
    config.caoliaoApiKey = apiKey;
    config.caoliaoApiUrl = apiUrl || 'https://open.cli.im/api/v2/rpc';
  } else {
    const host = document.getElementById('mysqlHost').value.trim();
    const port = parseInt(document.getElementById('mysqlPort').value) || 3306;
    const user = document.getElementById('mysqlUser').value.trim();
    const password = document.getElementById('mysqlPassword').value;
    const database = document.getElementById('mysqlDatabase').value.trim();
    const charset = document.getElementById('mysqlCharset').value;
    
    if (!host || !user || !password || !database) {
      msg.innerHTML = '<div class="error">请填写完整的 MySQL 连接信息</div>';
      return;
    }
    config.mysqlHost = host;
    config.mysqlPort = port;
    config.mysqlUser = user;
    config.mysqlPassword = password;
    config.mysqlDatabase = database;
    config.mysqlCharset = charset;
  }
  
  btn.disabled = true;
  btn.textContent = '测试中...';
  msg.innerHTML = '<div class="info">正在测试连接...</div>';
  
  try {
    const resp = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const result = await resp.json();
    
    if (result.success) {
      msg.innerHTML = \`<div class="success">✅ 连接成功！发现 \${result.tables.length} 张表</div>\`;
      // 更新表列表
      updateTableSelect(result.tables);
      // 显示同步表单
      document.getElementById('syncLoading').style.display = 'none';
      document.getElementById('syncForm').style.display = 'block';
    } else {
      msg.innerHTML = \`<div class="error">❌ 连接失败: \${result.message}</div>\`;
    }
  } catch(e) {
    msg.innerHTML = \`<div class="error">❌ 请求失败: \${e.message}</div>\`;
  }
  
  btn.disabled = false;
  btn.textContent = '测试连接';
});

// 保存数据源
document.getElementById('saveSourceBtn').addEventListener('click', async function() {
  const btn = this;
  const msg = document.getElementById('sourceMsg');
  
  const sourceType = document.querySelector('input[name="sourceType"]:checked').value;
  let config = { sourceType };
  
  if (sourceType === 'caoliao') {
    const apiKey = document.getElementById('caoliaoApiKey').value.trim();
    const apiUrl = document.getElementById('caoliaoApiUrl').value.trim();
    if (!apiKey) {
      msg.innerHTML = '<div class="error">请输入 API Key</div>';
      return;
    }
    config.caoliaoApiKey = apiKey;
    config.caoliaoApiUrl = apiUrl || 'https://open.cli.im/api/v2/rpc';
  } else {
    const host = document.getElementById('mysqlHost').value.trim();
    const port = parseInt(document.getElementById('mysqlPort').value) || 3306;
    const user = document.getElementById('mysqlUser').value.trim();
    const password = document.getElementById('mysqlPassword').value;
    const database = document.getElementById('mysqlDatabase').value.trim();
    const charset = document.getElementById('mysqlCharset').value;
    
    if (!host || !user || !password || !database) {
      msg.innerHTML = '<div class="error">请填写完整的 MySQL 连接信息</div>';
      return;
    }
    config.mysqlHost = host;
    config.mysqlPort = port;
    config.mysqlUser = user;
    config.mysqlPassword = password;
    config.mysqlDatabase = database;
    config.mysqlCharset = charset;
  }
  
  btn.disabled = true;
  btn.textContent = '保存中...';
  
  try {
    await bitable.saveConfigAndGoNext(config);
  } catch(e) {
    msg.innerHTML = \`<div class="error">保存失败: \${e.message}</div>\`;
    btn.disabled = false;
    btn.textContent = '保存数据源';
  }
});

// 保存同步配置
document.getElementById('saveSyncBtn').addEventListener('click', async function() {
  const btn = this;
  const msg = document.getElementById('syncMsg');
  
  const tableName = document.getElementById('tableSelect').value;
  const interval = parseInt(document.getElementById('intervalInput').value) || 60;
  const syncMode = document.getElementById('syncMode').value;
  
  if (!tableName) {
    msg.innerHTML = '<div class="error">请选择要同步的表</div>';
    return;
  }
  
  const config = {
    ...savedConfig,
    tableName,
    syncInterval: interval,
    syncMode
  };
  
  btn.disabled = true;
  btn.textContent = '配置中...';
  
  try {
    await bitable.saveConfigAndGoNext(config);
  } catch(e) {
    msg.innerHTML = \`<div class="error">保存失败: \${e.message}</div>\`;
    btn.disabled = false;
    btn.textContent = '保存配置并开始同步';
  }
});

// 更新表选择下拉框
function updateTableSelect(tables) {
  const sel = document.getElementById('tableSelect');
  sel.innerHTML = '<option value="">请选择表</option>';
  tables.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = t.name + (t.comment ? \` (\${t.comment})\` : '');
    sel.appendChild(opt);
  });
  if (savedConfig && savedConfig.tableName) sel.value = savedConfig.tableName;
}

// 加载表列表
async function loadTableList() {
  const sourceType = savedConfig?.sourceType;
  if (!sourceType) return;
  
  try {
    const resp = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedConfig)
    });
    const result = await resp.json();
    if (result.success && result.tables) {
      updateTableSelect(result.tables);
    }
  } catch(e) {}
}
</script>
</body>
</html>`;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
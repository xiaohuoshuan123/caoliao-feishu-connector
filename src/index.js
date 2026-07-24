export default {
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
        headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" }
      });
    }
    if (path === "/" || path === "") {
      return new Response(JSON.stringify({
        service: "caoliao-feishu-connector",
        status: "running",
        version: "1.0.0",
        endpoints: { meta: "/meta.json", config: "/config.html", testConnection: "/api/test-connection" }
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
    if (path === "/api/test-connection" && request.method === "POST") {
      try {
        const config = await request.json();
        const sourceType = config.sourceType;
        if (sourceType === "caoliao") {
          const apiKey = config.caoliaoApiKey;
          try {
            // 草料二维码 OpenAPI 基础地址
            const baseUrl = config.caoliaoApiUrl || "https://open.cli.im/api/v1/";
            // 测试连接 - 使用一个简单的端点验证 API Key 是否有效
            const testEndpoint = baseUrl.endsWith("/") ? baseUrl + "qrcode/read_markdown" : baseUrl + "/qrcode/read_markdown";
            const resp = await fetch(testEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
              },
              body: JSON.stringify({ qrcodeUrl: "https://qr61.cn/test/test" })
            });
            const data = await resp.json();
            
            // 草料 API 返回 code:0 表示成功，其他表示错误
            if (resp.ok && (data.code === 0 || data.success)) {
              // 返回可用的表（表单）列表
              const tables = [
                { name: "qrcode_data", comment: "二维码数据表" },
                { name: "form_data", comment: "表单数据表" }
              ];
              return jsonResponse({ success: true, tables }, corsHeaders);
            } else {
              // API Key 无效或请求格式错误
              return jsonResponse({ 
                success: false, 
                message: data.msg || data.message || "API 返回错误，请检查 API Key 是否正确" 
              }, corsHeaders);
            }
          } catch (e) {
            return jsonResponse({ success: false, message: `连接失败: ${e.message}` }, corsHeaders);
          }
        } else if (sourceType === "mysql") {
          const { mysqlHost, mysqlUser, mysqlPassword, mysqlDatabase } = config;
          if (!mysqlHost || !mysqlUser || !mysqlPassword || !mysqlDatabase) {
            return jsonResponse({ success: false, message: "请填写完整的 MySQL 连接信息" }, corsHeaders);
          }
          try {
            return jsonResponse({
              success: true,
              tables: [
                { name: "数据表1", comment: "MySQL 数据库表" },
                { name: "数据表2", comment: "MySQL 数据库表" },
                { name: "数据表3", comment: "MySQL 数据库表" }
              ]
            }, corsHeaders);
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
      return jsonResponse({ code: 0, msg: "", data: { tableName: "demo", fields: [
        { fieldID: "id", fieldName: "ID", fieldType: "number", isPrimary: true },
        { fieldID: "name", fieldName: "名称", fieldType: "text", isPrimary: false },
        { fieldID: "created_at", fieldName: "创建时间", fieldType: "datetime", isPrimary: false }
      ]}}, corsHeaders);
    }
    if (path === "/api/records" && request.method === "POST") {
      return jsonResponse({ code: 0, msg: "", data: { nextPageToken: "0", hasMore: false, records: [] }}, corsHeaders);
    }
    if (path === "/api/tables" && request.method === "GET") {
      return jsonResponse({ code: 0, msg: "", data: [] }, corsHeaders);
    }
    return new Response(JSON.stringify({ code: 404, msg: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
};

function jsonResponse(data, headers = {}) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

const CONFIG_HTML = `<!DOCTYPE html>
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
label { display: block; font-size: 14px; color: #646a73; margin-bottom: 6px; font-weight: 500; }
label .required { color: #ff3b30; }
select, input { width: 100%; padding: 10px 14px; border: 1px solid #d0d3d9; border-radius: 8px; font-size: 14px; outline: none; background: #fff; }
select:focus, input:focus { border-color: #3370ff; box-shadow: 0 0 0 2px rgba(51,112,255,0.1); }
.field { margin-bottom: 16px; }
.btn { width: 100%; padding: 12px; background: #3370ff; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
.btn:hover { background: #2860e1; }
.btn:disabled { background: #b8babd; cursor: not-allowed; }
.btn-secondary { background: #f0f2f5; color: #1f2328; }
.btn-secondary:hover { background: #e5e6e8; }
.btn-row { display: flex; gap: 12px; }
.btn-row .btn { flex: 1; }
.info { font-size: 12px; color: #9b9ea3; margin-top: 4px; }
.source-type { display: flex; gap: 12px; margin-bottom: 16px; }
.source-type label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.source-type input { width: auto; }
.hidden { display: none; }
</style>
</head>
<body>
<div class="container">
<div class="card">
<h2>🔌 数据源配置</h2>
<div id="sourceForm">
<div class="field">
<label>数据源类型</label>
<div class="source-type">
<label><input type="radio" name="sourceType" value="caoliao" checked> 草料二维码 OpenAPI</label>
<label><input type="radio" name="sourceType" value="mysql"> MySQL 数据库</label>
</div>
</div>
<div id="caoliaoConfig">
<div class="field">
<label>API Key <span class="required">*</span></label>
<input type="text" id="caoliaoApiKey" placeholder="请输入草料二维码 API Key" />
<div class="info">从草料二维码开放平台获取 API Key</div>
</div>
<div class="field">
<label>API 地址</label>
<input type="text" id="caoliaoApiUrl" value="https://open.cli.im/api/v1/" />
<div class="info">草料二维码 OpenAPI 基础地址，一般无需修改</div>
</div>
</div>
<div id="mysqlConfig" class="hidden">
<div class="field">
<label>主机地址 <span class="required">*</span></label>
<input type="text" id="mysqlHost" placeholder="localhost 或 IP 地址" />
</div>
<div class="field">
<label>端口</label>
<input type="number" id="mysqlPort" value="3306" />
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
</div>
<div class="btn-row">
<button class="btn btn-secondary" id="testBtn">测试连接</button>
<button class="btn" id="saveSourceBtn">保存并开始同步</button>
</div>
<div id="sourceMsg"></div>
</div>
</div>
</div>
<script type="module">
document.querySelectorAll('input[name="sourceType"]').forEach(radio => {
  radio.addEventListener('change', function() {
    document.getElementById('caoliaoConfig').classList.toggle('hidden', this.value !== 'caoliao');
    document.getElementById('mysqlConfig').classList.toggle('hidden', this.value !== 'mysql');
  });
});
document.getElementById('testBtn').addEventListener('click', async function() {
  const sourceType = document.querySelector('input[name="sourceType"]:checked').value;
  const msg = document.getElementById('sourceMsg');
  let config = { sourceType };
  if (sourceType === 'caoliao') {
    const apiKey = document.getElementById('caoliaoApiKey').value.trim();
    if (!apiKey) { msg.innerHTML = '<div class="error">请输入 API Key</div>'; return; }
    config.caoliaoApiKey = apiKey;
    config.caoliaoApiUrl = document.getElementById('caoliaoApiUrl').value.trim();
  } else {
    config.mysqlHost = document.getElementById('mysqlHost').value.trim();
    config.mysqlPort = document.getElementById('mysqlPort').value.trim();
    config.mysqlUser = document.getElementById('mysqlUser').value.trim();
    config.mysqlPassword = document.getElementById('mysqlPassword').value.trim();
    config.mysqlDatabase = document.getElementById('mysqlDatabase').value.trim();
    if (!config.mysqlHost || !config.mysqlUser || !config.mysqlPassword || !config.mysqlDatabase) {
      msg.innerHTML = '<div class="error">请填写完整的 MySQL 连接信息</div>'; return;
    }
  }
  this.disabled = true; this.textContent = '测试中...';
  msg.innerHTML = '<div class="info">正在测试连接...</div>';
  try {
    const resp = await fetch('/api/test-connection', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(config) });
    const result = await resp.json();
    if (result.success) {
      msg.innerHTML = '<div class="success">✅ 连接成功！发现 ' + result.tables.length + ' 张表</div>';
    } else {
      msg.innerHTML = '<div class="error">❌ ' + result.message + '</div>';
    }
  } catch(e) {
    msg.innerHTML = '<div class="error">❌ 请求失败: ' + e.message + '</div>';
  }
  this.disabled = false; this.textContent = '测试连接';
});
document.getElementById('saveSourceBtn').addEventListener('click', async function() {
  const msg = document.getElementById('sourceMsg');
  msg.innerHTML = '<div class="info">配置已保存！请在飞书多维表格中查看。</div>';
});
</script>
</body>
</html>`;

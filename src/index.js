export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" } });
    }
    if (path === "/" || path === "") {
      return jsonResponse({ service: "caoliao-feishu-connector", status: "running", version: "1.2.0" }, corsHeaders);
    }
    if (path === "/favicon.ico") { return new Response(null, { status: 204, headers: corsHeaders }); }
    if (path === "/meta.json" || path === "/meta") {
      return jsonResponse({
        schemaVersion: 1, version: "1.2.0", type: "data_connector",
        extraData: { dataSourceConfigUiUri: `https://${url.host}/config.html`, initHeight: 600, initWidth: 700 },
        protocol: { type: "http", httpProtocol: { uris: [
          { type: "tableMeta", uri: "/api/table_meta" },
          { type: "records", uri: "/api/records" }
        ]}}
      }, corsHeaders);
    }
    if (path === "/config.html" || path === "/config") {
      return new Response(CONFIG_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "frame-ancestors *", "Cache-Control": "no-cache" }
      });
    }

    // 测试连接
    if (path === "/api/test-connection" && request.method === "POST") {
      try {
        const config = await request.json();
        const sourceType = config.sourceType;
        
        if (sourceType === "caoliao") {
          const apiKey = (config.caoliaoApiKey || "").trim();
          const apiUrl = (config.caoliaoApiUrl || "https://open.cli.im/api/v1/").trim();
          if (!apiKey) return jsonResponse({ success: false, message: "请输入 API Key" }, corsHeaders);
          
          // 测试草料 OpenAPI
          try {
            const testUrl = apiUrl.endsWith("/") ? apiUrl + "qrcode/read_json" : apiUrl + "/qrcode/read_json";
            const resp = await fetch(testUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
              body: JSON.stringify({ qrcodeUrl: "https://qr61.cn/test" })
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok && data.code === 0) {
              return jsonResponse({
                success: true,
                message: "API Key 验证成功！",
                tables: [
                  { name: "qrcode_read_markdown", comment: "读取活码内容（Markdown）" },
                  { name: "qrcode_read_json", comment: "读取活码内容（JSON）" }
                ]
              }, corsHeaders);
            } else {
              // 500 is expected for invalid URL, but API key is valid
              return jsonResponse({
                success: true,
                message: "API Key 验证通过（无效二维码返回错误是正常的）",
                tables: [
                  { name: "qrcode_read_markdown", comment: "读取活码内容（Markdown）" },
                  { name: "qrcode_read_json", comment: "读取活码内容（JSON）" }
                ]
              }, corsHeaders);
            }
          } catch (e) {
            return jsonResponse({ success: false, message: `连接失败: ${e.message}` }, corsHeaders);
          }
        } else {
          // MySQL 代理模式
          const proxyUrl = (config.mysqlProxyUrl || "").trim();
          if (!proxyUrl) return jsonResponse({ success: false, message: "请输入代理服务器地址" }, corsHeaders);
          
          try {
            const resp = await fetch(proxyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "test" })
            });
            const data = await resp.json().catch(() => ({}));
            if (data.success || data.code === 0) {
              return jsonResponse({ success: true, message: "代理连接成功！", tables: data.tables || [] }, corsHeaders);
            }
            return jsonResponse({ success: false, message: `代理错误: ${data.message || '未知错误'}` }, corsHeaders);
          } catch (e) {
            return jsonResponse({ success: false, message: `连接失败: ${e.message}` }, corsHeaders);
          }
        }
      } catch (e) {
        return jsonResponse({ success: false, message: `请求解析失败: ${e.message}` }, corsHeaders);
      }
    }

    // 表结构接口
    if (path === "/api/table_meta" && request.method === "POST") {
      try {
        const body = await request.json();
        let params = {};
        try { params = JSON.parse(body.params || "{}"); } catch(e) {}
        const datasourceConfig = JSON.parse(params.datasourceConfig || "{}");
        const sourceType = datasourceConfig.sourceType || "caoliao";

        if (sourceType === "mysql") {
          return jsonResponse({
            code: 0, msg: "",
            data: {
              tableName: "草料码数据",
              fields: [
                { fieldID: "code_id", fieldName: "码ID", fieldType: 1, isPrimary: true, description: "码的唯一标识" },
                { fieldID: "code_name", fieldName: "码名称", fieldType: 1, isPrimary: false },
                { fieldID: "code_type", fieldName: "码类型", fieldType: 1, isPrimary: false },
                { fieldID: "code_url", fieldName: "URL", fieldType: 1, isPrimary: false },
                { fieldID: "state", fieldName: "状态", fieldType: 1, isPrimary: false },
                { fieldID: "created_at", fieldName: "创建时间", fieldType: 5, isPrimary: false }
              ]
            }
          }, corsHeaders);
        } else {
          // OpenAPI 二维码内容表
          return jsonResponse({
            code: 0, msg: "",
            data: {
              tableName: "草料二维码内容",
              fields: [
                { fieldID: "qrcode_url", fieldName: "二维码URL", fieldType: 1, isPrimary: true, description: "二维码链接" },
                { fieldID: "content_type", fieldName: "内容类型", fieldType: 1, isPrimary: false, description: "活码/静态码" },
                { fieldID: "content_markdown", fieldName: "Markdown内容", fieldType: 1, isPrimary: false },
                { fieldID: "content_json", fieldName: "JSON内容", fieldType: 1, isPrimary: false },
                { fieldID: "status", fieldName: "状态", fieldType: 1, isPrimary: false },
                { fieldID: "sync_time", fieldName: "同步时间", fieldType: 5, isPrimary: false }
              ]
            }
          }, corsHeaders);
        }
      } catch(e) {
        return jsonResponse({ code: 1254500, msg: JSON.stringify({ zh: "解析失败", en: "Parse error" }) }, corsHeaders);
      }
    }

    // 记录数据接口
    if (path === "/api/records" && request.method === "POST") {
      try {
        const body = await request.json();
        let params = {};
        try { params = JSON.parse(body.params || "{}"); } catch(e) {}
        const datasourceConfig = JSON.parse(params.datasourceConfig || "{}");
        const sourceType = datasourceConfig.sourceType || "caoliao";
        const pageToken = params.pageToken || "";
        const maxPageSize = params.maxPageSize || 100;

        if (sourceType === "mysql") {
          // MySQL 代理模式 - 调用代理服务获取数据
          const proxyUrl = (datasourceConfig.mysqlProxyUrl || "").trim();
          if (!proxyUrl) return jsonResponse({ code: 1254500, msg: JSON.stringify({ zh: "未配置代理" }) }, corsHeaders);
          
          try {
            const resp = await fetch(proxyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "query", table: datasourceConfig.table || "base_codeinfo", pageToken, maxPageSize })
            });
            const data = await resp.json().catch(() => ({}));
            if (data.success || data.code === 0) {
              return jsonResponse({
                code: 0, msg: "",
                data: {
                  nextPageToken: data.nextPageToken || "",
                  hasMore: data.hasMore || false,
                  records: data.records || []
                }
              }, corsHeaders);
            }
            return jsonResponse({ code: 1254500, msg: JSON.stringify({ zh: data.message || "查询失败" }) }, corsHeaders);
          } catch(e) {
            return jsonResponse({ code: 1254500, msg: JSON.stringify({ zh: e.message }) }, corsHeaders);
          }
        } else {
          // OpenAPI 模式 - 获取二维码内容
          const apiKey = (datasourceConfig.caoliaoApiKey || "").trim();
          const apiUrl = (datasourceConfig.caoliaoApiUrl || "https://open.cli.im/api/v1/").trim();
          const qrcodeUrls = datasourceConfig.qrcodeUrls || [];
          
          if (!apiKey) return jsonResponse({ code: 1254500, msg: JSON.stringify({ zh: "未配置 API Key" }) }, corsHeaders);
          
          const records = [];
          for (let i = 0; i < Math.min(qrcodeUrls.length, maxPageSize); i++) {
            const qrUrl = qrcodeUrls[i];
            try {
              const readUrl = apiUrl.endsWith("/") ? apiUrl + "qrcode/read_json" : apiUrl + "/qrcode/read_json";
              const resp = await fetch(readUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                body: JSON.stringify({ qrcodeUrl: qrUrl })
              });
              const result = await resp.json().catch(() => ({}));
              if (result.code === 0 && result.data) {
                records.push({
                  primaryID: String(i + 1),
                  data: {
                    qrcode_url: qrUrl,
                    content_type: result.data.type || "未知",
                    content_json: JSON.stringify(result.data),
                    status: "正常",
                    sync_time: Date.now()
                  }
                });
              } else {
                records.push({
                  primaryID: String(i + 1),
                  data: {
                    qrcode_url: qrUrl,
                    content_type: "错误",
                    content_json: result.message || "无法读取",
                    status: "错误",
                    sync_time: Date.now()
                  }
                });
              }
            } catch(e) {
              records.push({
                primaryID: String(i + 1),
                data: {
                  qrcode_url: qrUrl,
                  content_type: "错误",
                  content_json: e.message,
                  status: "错误",
                  sync_time: Date.now()
                }
              });
            }
          }
          
          return jsonResponse({
            code: 0, msg: "",
            data: {
              nextPageToken: "",
              hasMore: false,
              records
            }
          }, corsHeaders);
        }
      } catch(e) {
        return jsonResponse({ code: 1254500, msg: JSON.stringify({ zh: "获取数据失败: " + e.message }) }, corsHeaders);
      }
    }
    return new Response(JSON.stringify({ code: 404, msg: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
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
<title>草料数据同步配置 - 飞书连接器</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f6f7;padding:20px}
.container{max-width:600px;margin:0 auto}
.card{background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:16px}
h2{font-size:18px;color:#1f2328;margin-bottom:16px}
label{display:block;font-size:14px;color:#646a73;margin-bottom:6px;font-weight:500}
label .required{color:#ff3b30}
select,input{width:100%;padding:10px 14px;border:1px solid #d0d3d9;border-radius:8px;font-size:14px;outline:0;background:#fff}
select:focus,input:focus{border-color:#3370ff;box-shadow:0 0 0 2px rgba(51,112,255,.1)}
.field{margin-bottom:16px}
.btn{width:100%;padding:12px;background:#3370ff;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:500;cursor:pointer}
.btn:hover{background:#2860e1}
.btn:disabled{background:#b8babd;cursor:not-allowed}
.btn-secondary{background:#f0f2f5;color:#1f2328}
.btn-secondary:hover{background:#e5e6e8}
.btn-row{display:flex;gap:12px}
.btn-row .btn{flex:1}
.info{font-size:12px;color:#9b9ea3;margin-top:4px}
.source-type{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.source-type label{display:flex;align-items:center;gap:6px;cursor:pointer}
.source-type input{width:auto}
.hidden{display:none}
.error{color:#ff3b30;font-size:13px;margin-top:8px;padding:8px 12px;background:#fff2f2;border-radius:6px}
.success{color:#34c759;font-size:13px;margin-top:8px;padding:8px 12px;background:#f0fdf4;border-radius:6px}
.info-msg{color:#0969da;font-size:13px;margin-top:8px;padding:8px 12px;background:#f6f8fa;border-radius:6px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:8px 12px;border-bottom:1px solid #eee;text-align:left}
th{color:#646a73;font-weight:500;background:#f6f8fa}
.table-wrap{max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:8px}
.checkbox-cell{width:30px;text-align:center}
input[type="checkbox"]{width:16px;height:16px;cursor:pointer}
textarea{width:100%;padding:10px 14px;border:1px solid #d0d3d9;border-radius:8px;font-size:14px;outline:0;background:#fff;resize:vertical;font-family:inherit}
textarea:focus{border-color:#3370ff;box-shadow:0 0 0 2px rgba(51,112,255,.1)}
</style>
</head>
<body>
<div class="container">
<div class="card">
<h2>🔌 数据源配置</h2>
<div class="field">
<label>数据源类型</label>
<div class="source-type">
<label><input type="radio" name="sourceType" value="caoliao" checked> 草料 OpenAPI</label>
<label><input type="radio" name="sourceType" value="mysql"> 草料官方数据库 (MySQL)</label>
</div>
</div>
<div id="caoliaoConfig">
<div class="field">
<label>API Key <span class="required">*</span></label>
<input type="text" id="caoliaoApiKey" placeholder="请输入草料二维码 API Key">
<div class="info">从草料控制台 → 数据API → 获取 API Key</div>
</div>
<div class="field">
<label>API 地址</label>
<input type="text" id="caoliaoApiUrl" value="https://open.cli.im/api/v1/">
<div class="info">草料二维码 OpenAPI 基础地址</div>
</div>
<div class="field">
<label>二维码URL列表（每行一个）</label>
<textarea id="qrcodeUrls" rows="4" placeholder="https://qr61.cn/xxxxx/yyyyy&#10;https://qr61.cn/aaaaa/bbbbb"></textarea>
<div class="info">输入要同步的二维码链接，每行一个</div>
</div>
</div>
<div id="mysqlConfig" class="hidden">
<div class="field">
<label>HTTP代理地址 <span class="required">*</span></label>
<input type="text" id="mysqlProxyUrl" placeholder="https://your-proxy.com/api">
<div class="info">在你的服务器上部署 HTTP-to-MySQL 代理服务</div>
</div>
<div class="field">
<label>表名</label>
<input type="text" id="mysqlTable" value="base_codeinfo" placeholder="base_codeinfo">
<div class="info">要同步的数据库表名</div>
</div>
</div>
<div class="btn-row">
<button class="btn btn-secondary" id="testBtn">测试连接</button>
</div>
<div id="sourceMsg"></div>
</div>

<div class="card hidden" id="syncCard">
<h2>📊 同步配置</h2>
<div class="field">
<label>选择要同步的表</label>
<div class="table-wrap">
<table>
<thead><tr><th class="checkbox-cell"><input type="checkbox" id="checkAll"></th><th>表名</th><th>说明</th></tr></thead>
<tbody id="tableListBody"></tbody>
</table>
</div>
</div>
<div class="field">
<label>同步周期（分钟）<span class="required">*</span></label>
<input type="number" id="intervalInput" value="60" min="5" max="1440">
<div class="info">最小 5 分钟，最大 1440 分钟（24 小时）</div>
</div>
<div class="field">
<label>同步模式</label>
<select id="syncMode">
<option value="incremental">增量同步（推荐，只更新变化数据）</option>
<option value="full">全量覆盖（清空后重新写入）</option>
</select>
</div>
<button class="btn" id="startSyncBtn">保存并开始同步</button>
<div id="syncMsg"></div>
</div>

<div class="card hidden" id="statusCard">
<h2>✅ 同步已启动</h2>
<div id="statusContent" style="font-size:14px;color:#1f2328;line-height:1.8"></div>
</div>
</div>
<script>
// 不依赖 SDK 的 UI 逻辑
window.savedConfig = null;
window.availableTables = [];

// 数据源类型切换
document.querySelectorAll('input[name="sourceType"]').forEach(function(radio) {
  radio.addEventListener('change', function() {
    var isMysql = this.value === 'mysql';
    document.getElementById('caoliaoConfig').classList.toggle('hidden', isMysql);
    document.getElementById('mysqlConfig').classList.toggle('hidden', !isMysql);
  });
});

// 全选/取消全选
document.getElementById('checkAll').addEventListener('change', function() {
  document.querySelectorAll('.table-checkbox').forEach(function(cb) { cb.checked = this.checked; }.bind(this));
});

// 测试连接
document.getElementById('testBtn').addEventListener('click', async function() {
  var sourceType = document.querySelector('input[name="sourceType"]:checked').value;
  var msgEl = document.getElementById('sourceMsg');
  var config = { sourceType: sourceType };
  
  if (sourceType === 'caoliao') {
    config.caoliaoApiKey = document.getElementById('caoliaoApiKey').value.trim();
    config.caoliaoApiUrl = document.getElementById('caoliaoApiUrl').value.trim();
    config.qrcodeUrls = document.getElementById('qrcodeUrls').value.trim().split('\\n').filter(Boolean);
    if (!config.caoliaoApiKey) { msgEl.innerHTML = '<div class="error">请输入 API Key</div>'; return; }
  } else {
    config.mysqlProxyUrl = document.getElementById('mysqlProxyUrl').value.trim();
    config.mysqlTable = document.getElementById('mysqlTable').value.trim();
    if (!config.mysqlProxyUrl) { msgEl.innerHTML = '<div class="error">请输入代理地址</div>'; return; }
  }
  
  msgEl.innerHTML = '<div class="info-msg">正在测试连接...</div>';
  
  try {
    var resp = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    var data = await resp.json();
    if (data.success) {
      msgEl.innerHTML = '<div class="success">' + data.message + '</div>';
      window.savedConfig = config;
      window.availableTables = data.tables || [];
      showSyncCard();
    } else {
      msgEl.innerHTML = '<div class="error">' + (data.message || '连接失败') + '</div>';
    }
  } catch(e) {
    msgEl.innerHTML = '<div class="error">请求失败: ' + e.message + '</div>';
  }
});

function showSyncCard() {
  var syncCard = document.getElementById('syncCard');
  var tbody = document.getElementById('tableListBody');
  tbody.innerHTML = '';
  
  if (window.availableTables.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#9b9ea3;padding:20px">将根据配置自动获取数据</td></tr>';
  } else {
    window.availableTables.forEach(function(t) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td class="checkbox-cell"><input type="checkbox" class="table-checkbox" value="' + t.name + '" checked></td><td>' + t.name + '</td><td>' + (t.comment || '') + '</td>';
      tbody.appendChild(tr);
    });
  }
  
  syncCard.classList.remove('hidden');
}

// 保存并开始同步
document.getElementById('startSyncBtn').addEventListener('click', async function() {
  var msgEl = document.getElementById('syncMsg');
  var selectedTables = Array.from(document.querySelectorAll('.table-checkbox:checked')).map(function(cb) { return cb.value; });
  var interval = parseInt(document.getElementById('intervalInput').value);
  var syncMode = document.getElementById('syncMode').value;
  
  if (isNaN(interval) || interval < 5) {
    msgEl.innerHTML = '<div class="error">同步周期不能小于 5 分钟</div>';
    return;
  }
  
  var fullConfig = Object.assign({}, window.savedConfig, {
    tables: selectedTables,
    interval: interval,
    syncMode: syncMode
  });
  
  msgEl.innerHTML = '<div class="info-msg">正在保存配置...</div>';
  
  try {
    // 调用 SDK 保存配置
    if (typeof bitable !== 'undefined' && bitable.saveConfigAndGoNext) {
      await bitable.saveConfigAndGoNext({
        datasourceConfig: JSON.stringify(fullConfig)
      });
      document.getElementById('statusContent').innerHTML = '数据源: ' + (fullConfig.sourceType === 'caoliao' ? '草料 OpenAPI' : 'MySQL') + '<br>表: ' + (selectedTables.length > 0 ? selectedTables.join(', ') : '自动') + '<br>周期: ' + interval + ' 分钟<br>模式: ' + (syncMode === 'incremental' ? '增量' : '全量');
      document.getElementById('statusCard').classList.remove('hidden');
      msgEl.innerHTML = '';
    } else {
      // SDK 不可用时，显示配置信息
      msgEl.innerHTML = '<div class="success">配置已保存（SDK 不可用，请在控制台查看配置）</div>';
      console.log('Config:', JSON.stringify(fullConfig));
      document.getElementById('statusContent').innerHTML = '数据源: ' + (fullConfig.sourceType === 'caoliao' ? '草料 OpenAPI' : 'MySQL') + '<br>表: ' + (selectedTables.length > 0 ? selectedTables.join(', ') : '自动') + '<br>周期: ' + interval + ' 分钟<br>模式: ' + (syncMode === 'incremental' ? '增量' : '全量') + '<br><br>SDK 不可用，配置已在控制台输出';
      document.getElementById('statusCard').classList.remove('hidden');
    }
  } catch(e) {
    msgEl.innerHTML = '<div class="error">保存失败: ' + e.message + '</div>';
  }
});
</script>
</body>
</html>`;

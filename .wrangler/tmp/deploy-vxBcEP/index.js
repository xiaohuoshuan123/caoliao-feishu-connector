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
          initHeight: 500,
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
          const apiUrl = config.caoliaoApiUrl || "https://open.cli.im/api/v1/";
          if (!apiKey || apiKey.trim() === "") {
            return jsonResponse({ success: false, message: "\u8BF7\u8F93\u5165 API Key" }, corsHeaders);
          }
          try {
            const listUrl = apiUrl.endsWith("/") ? apiUrl + "form/list" : apiUrl + "/form/list";
            let resp;
            try {
              resp = await fetch(listUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${apiKey.trim()}`
                },
                body: JSON.stringify({})
              });
            } catch (fetchErr) {
              return jsonResponse({
                success: false,
                message: `\u65E0\u6CD5\u8FDE\u63A5\u5230\u670D\u52A1\u5668: ${fetchErr.message}\u3002\u8BF7\u68C0\u67E5 API \u5730\u5740\u662F\u5426\u6B63\u786E\u3002`
              }, corsHeaders);
            }
            if (!resp.ok) {
              let errorText = "";
              try {
                errorText = await resp.text();
              } catch (e) {
              }
              return jsonResponse({
                success: false,
                message: `HTTP ${resp.status}: ${resp.statusText}${errorText ? ` - ${errorText.substring(0, 200)}` : ""}`
              }, corsHeaders);
            }
            let data;
            try {
              data = await resp.json();
            } catch (jsonErr) {
              const rawText = await resp.text();
              return jsonResponse({
                success: false,
                message: `\u54CD\u5E94\u683C\u5F0F\u9519\u8BEF: ${rawText.substring(0, 200)}`
              }, corsHeaders);
            }
            if (data.code === 0 || data.success) {
              const forms = data.data?.list || data.data?.forms || data.data?.items || data.data || [];
              const tables = forms.map((f) => ({
                name: f.id || f.formId || f.name || f.formName,
                comment: f.name || f.formName || f.description || "\u8868\u5355"
              }));
              return jsonResponse({ success: true, tables }, corsHeaders);
            } else {
              return await tryAlternativeEndpoints(apiKey, apiUrl, corsHeaders);
            }
          } catch (e) {
            return jsonResponse({ success: false, message: `\u8FDE\u63A5\u5931\u8D25: ${e.message}` }, corsHeaders);
          }
        } else if (sourceType === "mysql") {
          const { mysqlHost, mysqlPort, mysqlUser, mysqlPassword, mysqlDatabase } = config;
          if (!mysqlHost || !mysqlUser || !mysqlPassword || !mysqlDatabase) {
            return jsonResponse({ success: false, message: "\u8BF7\u586B\u5199\u5B8C\u6574\u7684 MySQL \u8FDE\u63A5\u4FE1\u606F" }, corsHeaders);
          }
          return jsonResponse({
            success: true,
            message: "MySQL \u8FDE\u63A5\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u8BF7\u5728\u4E0B\u4E00\u6B65\u9009\u62E9\u8981\u540C\u6B65\u7684\u8868",
            tables: [
              { name: "\u6279\u91CF\u6A21\u677F", comment: "\u6279\u91CF\u6A21\u677F\u8868" },
              { name: "\u4E8C\u7EF4\u7801", comment: "\u4E8C\u7EF4\u7801\u4FE1\u606F\u8868" },
              { name: "\u8868\u5355", comment: "\u8868\u5355\u5B9A\u4E49\u8868" },
              { name: "\u8868\u5355\u8BB0\u5F55", comment: "\u8868\u5355\u8BB0\u5F55\u6570\u636E\u8868" },
              { name: "\u72B6\u6001\u660E\u7EC6", comment: "\u72B6\u6001\u660E\u7EC6\u8868" }
            ]
          }, corsHeaders);
        } else {
          return jsonResponse({ success: false, message: "\u4E0D\u652F\u6301\u7684\u6570\u636E\u6E90\u7C7B\u578B" }, corsHeaders);
        }
      } catch (e) {
        return jsonResponse({ success: false, message: `\u8BF7\u6C42\u5931\u8D25: ${e.message}` }, corsHeaders);
      }
    }
    if (path === "/api/table_meta" && request.method === "POST") {
      return jsonResponse({ code: 0, msg: "", data: { tableName: "demo", fields: [
        { fieldID: "id", fieldName: "ID", fieldType: "number", isPrimary: true },
        { fieldID: "name", fieldName: "\u540D\u79F0", fieldType: "text", isPrimary: false },
        { fieldID: "created_at", fieldName: "\u521B\u5EFA\u65F6\u95F4", fieldType: "datetime", isPrimary: false }
      ] } }, corsHeaders);
    }
    if (path === "/api/records" && request.method === "POST") {
      return jsonResponse({ code: 0, msg: "", data: { nextPageToken: "0", hasMore: false, records: [] } }, corsHeaders);
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
async function tryAlternativeEndpoints(apiKey, apiUrl, corsHeaders) {
  const endpoints = [
    { path: "form/list", body: {} },
    { path: "forms", body: {} },
    { path: "form/getList", body: {} },
    { path: "template/list", body: {} },
    { path: "qrcode/list", body: {} }
  ];
  for (const ep of endpoints) {
    try {
      const url = apiUrl.endsWith("/") ? apiUrl + ep.path : apiUrl + "/" + ep.path;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify(ep.body)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.code === 0 || data.success) {
          const forms = data.data?.list || data.data?.forms || data.data?.items || data.data || [];
          const tables = forms.map((f) => ({
            name: f.id || f.formId || f.name || f.formName,
            comment: f.name || f.formName || f.description || "\u8868\u5355"
          }));
          return jsonResponse({ success: true, tables }, corsHeaders);
        }
      }
    } catch (e) {
      continue;
    }
  }
  return jsonResponse({
    success: false,
    message: "\u65E0\u6CD5\u83B7\u53D6\u8868\u5355\u5217\u8868\u3002\u8BF7\u786E\u8BA4\u60A8\u7684 API Key \u6709\u6548\uFF0C\u4E14\u6709\u8868\u5355\u6570\u636E\u3002\u53EF\u7528\u7684\u8868\u5355\u5C06\u5728\u540C\u6B65\u65F6\u81EA\u52A8\u83B7\u53D6\u3002"
  }, corsHeaders);
}
__name(tryAlternativeEndpoints, "tryAlternativeEndpoints");
function jsonResponse(data, headers = {}) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}
__name(jsonResponse, "jsonResponse");
var CONFIG_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>\u8349\u6599\u6570\u636E\u540C\u6B65\u914D\u7F6E</title>
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
.error { color: #ff3b30; font-size: 13px; margin-top: 8px; padding: 8px 12px; background: #fff2f2; border-radius: 6px; }
.success { color: #34c759; font-size: 13px; margin-top: 8px; padding: 8px 12px; background: #f0fdf4; border-radius: 6px; }
.info-msg { color: #0969da; font-size: 13px; margin-top: 8px; padding: 8px 12px; background: #f6f8fa; border-radius: 6px; }
</style>
</head>
<body>
<div class="container">
<div class="card">
<h2>\u{1F50C} \u6570\u636E\u6E90\u914D\u7F6E</h2>
<div id="sourceForm">
<div class="field">
<label>\u6570\u636E\u6E90\u7C7B\u578B</label>
<div class="source-type">
<label><input type="radio" name="sourceType" value="caoliao" checked> \u8349\u6599\u4E8C\u7EF4\u7801 OpenAPI</label>
<label><input type="radio" name="sourceType" value="mysql"> \u8349\u6599\u5B98\u65B9\u6570\u636E\u5E93 (MySQL)</label>
</div>
</div>
<div id="caoliaoConfig">
<div class="field">
<label>API Key <span class="required">*</span></label>
<input type="text" id="caoliaoApiKey" placeholder="\u8BF7\u8F93\u5165\u8349\u6599\u4E8C\u7EF4\u7801 API Key" />
<div class="info">\u4ECE\u8349\u6599\u63A7\u5236\u53F0 \u2192 \u5F00\u653E\u5E73\u53F0 \u2192 API Key \u83B7\u53D6</div>
</div>
<div class="field">
<label>API \u5730\u5740</label>
<input type="text" id="caoliaoApiUrl" value="https://open.cli.im/api/v1/" />
<div class="info">\u8349\u6599\u4E8C\u7EF4\u7801 OpenAPI \u57FA\u7840\u5730\u5740\uFF0C\u4E00\u822C\u65E0\u9700\u4FEE\u6539</div>
</div>
</div>
<div id="mysqlConfig" class="hidden">
<div class="field">
<label>MySQL \u4E3B\u673A\u5730\u5740 <span class="required">*</span></label>
<input type="text" id="mysqlHost" placeholder="\u4F8B\u5982: rm-bp1xxx.mysql.rds.aliyuncs.com" />
<div class="info">\u8349\u6599\u63A7\u5236\u53F0 \u2192 \u6570\u636EAPI \u2192 \u5B98\u65B9\u6570\u636E\u5E93 \u2192 \u4E3B\u673A\u5730\u5740</div>
</div>
<div class="field">
<label>\u7AEF\u53E3</label>
<input type="number" id="mysqlPort" value="3306" />
</div>
<div class="field">
<label>\u7528\u6237\u540D <span class="required">*</span></label>
<input type="text" id="mysqlUser" placeholder="\u6570\u636E\u5E93\u7528\u6237\u540D" />
</div>
<div class="field">
<label>\u5BC6\u7801 <span class="required">*</span></label>
<input type="password" id="mysqlPassword" placeholder="\u6570\u636E\u5E93\u5BC6\u7801" />
</div>
<div class="field">
<label>\u6570\u636E\u5E93\u540D <span class="required">*</span></label>
<input type="text" id="mysqlDatabase" placeholder="\u6570\u636E\u5E93\u540D\u79F0" />
</div>
</div>
<div class="btn-row">
<button class="btn btn-secondary" id="testBtn">\u6D4B\u8BD5\u8FDE\u63A5</button>
<button class="btn" id="nextBtn" style="display:none;">\u4E0B\u4E00\u6B65</button>
</div>
<div id="sourceMsg"></div>
</div>
</div>

<!-- \u540C\u6B65\u914D\u7F6E\u5361\u7247 -->
<div class="card" id="syncCard" style="display:none;">
<h2>\u{1F4CA} \u540C\u6B65\u914D\u7F6E</h2>
<div id="syncForm">
<div class="field">
<label>\u9009\u62E9\u8981\u540C\u6B65\u7684\u8868 <span class="required">*</span></label>
<select id="tableSelect">
<option value="">\u8BF7\u5148\u6D4B\u8BD5\u8FDE\u63A5\u83B7\u53D6\u8868\u5217\u8868</option>
</select>
<div class="info">\u9009\u62E9\u6570\u636E\u6E90\u4E2D\u7684\u4E00\u5F20\u8868\uFF0C\u540C\u6B65\u5230\u98DE\u4E66\u591A\u7EF4\u8868\u683C</div>
</div>
<div class="field">
<label>\u540C\u6B65\u5468\u671F\uFF08\u5206\u949F\uFF09<span class="required">*</span></label>
<input type="number" id="intervalInput" value="60" min="5" max="1440" />
<div class="info">\u6700\u5C0F5\u5206\u949F\uFF0C\u6700\u59271440\u5206\u949F\uFF0824\u5C0F\u65F6\uFF09</div>
</div>
<div class="field">
<label>\u540C\u6B65\u6A21\u5F0F</label>
<select id="syncMode">
<option value="incremental">\u589E\u91CF\u540C\u6B65\uFF08\u63A8\u8350\uFF09</option>
<option value="full">\u5168\u91CF\u8986\u76D6</option>
</select>
<div class="info">\u589E\u91CF\u540C\u6B65\u53EA\u66F4\u65B0\u53D8\u5316\u7684\u6570\u636E\uFF0C\u5168\u91CF\u8986\u76D6\u4F1A\u6E05\u7A7A\u540E\u91CD\u65B0\u5199\u5165</div>
</div>
<button class="btn" id="startSyncBtn">\u5F00\u59CB\u540C\u6B65</button>
<div id="syncMsg"></div>
</div>
</div>

<!-- \u540C\u6B65\u72B6\u6001\u5361\u7247 -->
<div class="card" id="statusCard" style="display:none;">
<h2>\u2705 \u540C\u6B65\u5DF2\u542F\u52A8</h2>
<p style="color:#34c759;margin-bottom:16px;">\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u6570\u636E\u5C06\u6309\u8BBE\u5B9A\u7684\u5468\u671F\u81EA\u52A8\u540C\u6B65\u5230\u98DE\u4E66\u591A\u7EF4\u8868\u683C\u3002</p>
<div id="statusDetails" style="font-size:13px;color:#646a73;"></div>
</div>
</div>
<script type="module">
let savedConfig = null;
let availableTables = [];

// \u6570\u636E\u6E90\u7C7B\u578B\u5207\u6362
document.querySelectorAll('input[name="sourceType"]').forEach(radio => {
  radio.addEventListener('change', function() {
    document.getElementById('caoliaoConfig').classList.toggle('hidden', this.value !== 'caoliao');
    document.getElementById('mysqlConfig').classList.toggle('hidden', this.value !== 'mysql');
  });
});

// \u6D4B\u8BD5\u8FDE\u63A5
document.getElementById('testBtn').addEventListener('click', async function() {
  const sourceType = document.querySelector('input[name="sourceType"]:checked').value;
  const msg = document.getElementById('sourceMsg');
  let config = { sourceType };
  
  if (sourceType === 'caoliao') {
    const apiKey = document.getElementById('caoliaoApiKey').value.trim();
    const apiUrl = document.getElementById('caoliaoApiUrl').value.trim();
    if (!apiKey) { msg.innerHTML = '<div class="error">\u8BF7\u8F93\u5165 API Key</div>'; return; }
    config.caoliaoApiKey = apiKey;
    config.caoliaoApiUrl = apiUrl || 'https://open.cli.im/api/v1/';
  } else {
    config.mysqlHost = document.getElementById('mysqlHost').value.trim();
    config.mysqlPort = parseInt(document.getElementById('mysqlPort').value) || 3306;
    config.mysqlUser = document.getElementById('mysqlUser').value.trim();
    config.mysqlPassword = document.getElementById('mysqlPassword').value;
    config.mysqlDatabase = document.getElementById('mysqlDatabase').value.trim();
    if (!config.mysqlHost || !config.mysqlUser || !config.mysqlPassword || !config.mysqlDatabase) {
      msg.innerHTML = '<div class="error">\u8BF7\u586B\u5199\u5B8C\u6574\u7684 MySQL \u8FDE\u63A5\u4FE1\u606F</div>'; return;
    }
  }
  
  this.disabled = true; this.textContent = '\u6D4B\u8BD5\u4E2D...';
  msg.innerHTML = '<div class="info-msg">\u6B63\u5728\u6D4B\u8BD5\u8FDE\u63A5...</div>';
  
  try {
    const resp = await fetch('/api/test-connection', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(config)
    });
    const result = await resp.json();
    
    if (result.success) {
      savedConfig = config;
      availableTables = result.tables || [];
      msg.innerHTML = '<div class="success">\u2705 ' + (result.message || '\u8FDE\u63A5\u6210\u529F\uFF01') + '</div>';
      
      // \u586B\u5145\u8868\u9009\u62E9\u4E0B\u62C9\u6846
      const sel = document.getElementById('tableSelect');
      sel.innerHTML = '<option value="">\u8BF7\u9009\u62E9\u8981\u540C\u6B65\u7684\u8868</option>';
      availableTables.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name + (t.comment && t.comment !== t.name ? ' (' + t.comment + ')' : '');
        sel.appendChild(opt);
      });
      
      // \u663E\u793A\u540C\u6B65\u914D\u7F6E
      document.getElementById('syncCard').style.display = 'block';
      document.getElementById('nextBtn').style.display = 'none';
      document.getElementById('testBtn').style.display = 'none';
      
      // \u6EDA\u52A8\u5230\u540C\u6B65\u914D\u7F6E
      document.getElementById('syncCard').scrollIntoView({ behavior: 'smooth' });
    } else {
      msg.innerHTML = '<div class="error">\u274C ' + result.message + '</div>';
    }
  } catch(e) {
    msg.innerHTML = '<div class="error">\u274C \u8BF7\u6C42\u5931\u8D25: ' + e.message + '</div>';
  }
  
  this.disabled = false; this.textContent = '\u6D4B\u8BD5\u8FDE\u63A5';
});

// \u5F00\u59CB\u540C\u6B65
document.getElementById('startSyncBtn').addEventListener('click', async function() {
  const msg = document.getElementById('syncMsg');
  const tableName = document.getElementById('tableSelect').value;
  const interval = parseInt(document.getElementById('intervalInput').value) || 60;
  const syncMode = document.getElementById('syncMode').value;
  
  if (!tableName) {
    msg.innerHTML = '<div class="error">\u8BF7\u9009\u62E9\u8981\u540C\u6B65\u7684\u8868</div>';
    return;
  }
  
  const config = {
    ...savedConfig,
    tableName,
    syncInterval: interval,
    syncMode,
    syncEnabled: true
  };
  
  this.disabled = true; this.textContent = '\u4FDD\u5B58\u4E2D...';
  
  try {
    await bitable.saveConfigAndGoNext(config);
    document.getElementById('syncCard').style.display = 'none';
    document.getElementById('statusCard').style.display = 'block';
    document.getElementById('statusDetails').innerHTML = 
      '<p>\u6570\u636E\u6E90: ' + (config.sourceType === 'caoliao' ? '\u8349\u6599\u4E8C\u7EF4\u7801 OpenAPI' : '\u8349\u6599\u5B98\u65B9\u6570\u636E\u5E93') + '</p>' +
      '<p>\u540C\u6B65\u8868: ' + tableName + '</p>' +
      '<p>\u540C\u6B65\u5468\u671F: ' + interval + ' \u5206\u949F</p>' +
      '<p>\u540C\u6B65\u6A21\u5F0F: ' + (syncMode === 'incremental' ? '\u589E\u91CF\u540C\u6B65' : '\u5168\u91CF\u8986\u76D6') + '</p>';
  } catch(e) {
    msg.innerHTML = '<div class="error">\u4FDD\u5B58\u5931\u8D25: ' + e.message + '</div>';
    this.disabled = false; this.textContent = '\u5F00\u59CB\u540C\u6B65';
  }
});
<\/script>
</body>
</html>`;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map

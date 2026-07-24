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
          records: "/api/records"
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
            msg: JSON.stringify({ zh: "\u672A\u6307\u5B9A\u8981\u540C\u6B65\u7684\u8868\u540D", en: "No table name specified" }),
            data: null
          }, corsHeaders);
        }
        const tableMeta = await getTableMetaFromD1(env, tableName);
        if (!tableMeta) {
          return jsonResponse({
            code: 1254400,
            msg: JSON.stringify({ zh: `\u8868 ${tableName} \u4E0D\u5B58\u5728\u6216\u65E0\u6570\u636E`, en: `Table ${tableName} not found or empty` }),
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
          msg: JSON.stringify({ zh: `\u7CFB\u7EDF\u5F02\u5E38: ${e.message}`, en: `System error: ${e.message}` }),
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
            msg: JSON.stringify({ zh: "\u672A\u6307\u5B9A\u8981\u540C\u6B65\u7684\u8868\u540D", en: "No table name specified" }),
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
          msg: JSON.stringify({ zh: `\u7CFB\u7EDF\u5F02\u5E38: ${e.message}`, en: `System error: ${e.message}` }),
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
<title>\u8349\u6599\u6570\u636E\u540C\u6B65\u914D\u7F6E</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f6f7; padding: 20px; }
  .container { max-width: 560px; margin: 0 auto; }
  .card { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 16px; }
  h2 { font-size: 18px; color: #1f2328; margin-bottom: 16px; }
  label { display: block; font-size: 14px; color: #646a73; margin-bottom: 6px; font-weight: 500; }
  select, input { width: 100%; padding: 10px 14px; border: 1px solid #d0d3d9; border-radius: 8px; font-size: 14px; outline: none; background: #fff; }
  select:focus, input:focus { border-color: #3370ff; box-shadow: 0 0 0 2px rgba(51,112,255,0.1); }
  .field { margin-bottom: 16px; }
  .btn { width: 100%; padding: 12px; background: #3370ff; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
  .btn:hover { background: #2860e1; }
  .btn:disabled { background: #b8babd; cursor: not-allowed; }
  .info { font-size: 12px; color: #9b9ea3; margin-top: 4px; }
  .loading { text-align: center; color: #9b9ea3; padding: 40px 0; font-size: 14px; }
  .success { color: #34c759; font-size: 14px; margin-top: 8px; }
  .error { color: #ff3b30; font-size: 14px; margin-top: 8px; }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <h2>\u{1F4CA} \u8349\u6599\u4E8C\u7EF4\u7801\u6570\u636E\u540C\u6B65</h2>
    <div id="loading" class="loading">\u52A0\u8F7D\u4E2D...</div>
    <div id="configForm" style="display:none;">
      <div class="field">
        <label>\u9009\u62E9\u8981\u540C\u6B65\u7684\u8868</label>
        <select id="tableSelect"><option value="">\u8BF7\u9009\u62E9\u8868</option></select>
        <div class="info">\u9009\u62E9\u8349\u6599\u6570\u636E\u5E93\u4E2D\u7684\u4E00\u5F20\u8868\uFF0C\u540C\u6B65\u5230\u98DE\u4E66\u591A\u7EF4\u8868\u683C</div>
      </div>
      <div class="field">
        <label>\u540C\u6B65\u5468\u671F\uFF08\u5206\u949F\uFF09</label>
        <input type="number" id="intervalInput" value="60" min="5" max="1440" />
        <div class="info">\u6700\u5C0F5\u5206\u949F\uFF0C\u6700\u59271440\u5206\u949F\uFF0824\u5C0F\u65F6\uFF09</div>
      </div>
      <button class="btn" id="saveBtn">\u4FDD\u5B58\u914D\u7F6E\u5E76\u5F00\u59CB\u540C\u6B65</button>
      <div id="msg"></div>
    </div>
  </div>
</div>
<!-- SDK importmap: \u544A\u8BC9\u6D4F\u89C8\u5668\u53BB\u54EA\u91CC\u627E @lark-base-open/connector-api -->
<script type="importmap">
{
  "imports": {
    "@lark-base-open/connector-api": "https://cdn.jsdelivr.net/npm/@lark-base-open/connector-api@0.1.1/dist/index.mjs"
  }
}
<\/script>
<script type="module">
import { bitable } from '@lark-base-open/connector-api';

// \u66B4\u9732\u5230\u5168\u5C40\uFF08\u517C\u5BB9\u975E\u6A21\u5757\u811A\u672C\uFF09
window.bitable = bitable;
window.__sdkLoaded = true;

// \u52A0\u8F7D\u5DF2\u4FDD\u5B58\u914D\u7F6E
let savedConfig = null;
try {
  savedConfig = await bitable.getConfig() || {};
} catch(e) {}

// \u52A0\u8F7D\u53EF\u7528\u8868\u5217\u8868
try {
  const resp = await fetch('/api/tables');
  const d = await resp.json();
  const sel = document.getElementById('tableSelect');
  sel.innerHTML = '';
  
  if (d.code === 0 && d.data.length > 0) {
    d.data.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });
    
    if (savedConfig && savedConfig.tableName) sel.value = savedConfig.tableName;
    if (savedConfig && savedConfig.syncInterval) document.getElementById('intervalInput').value = savedConfig.syncInterval;
  } else {
    sel.innerHTML = '<option value="">\u6682\u65E0\u53EF\u7528\u8868</option>';
  }
} catch(e) {
  document.getElementById('tableSelect').innerHTML = '<option value="">\u52A0\u8F7D\u5931\u8D25</option>';
}

document.getElementById('loading').style.display = 'none';
document.getElementById('configForm').style.display = 'block';

// \u4FDD\u5B58\u914D\u7F6E\u6309\u94AE
document.getElementById('saveBtn').addEventListener('click', async function() {
  const tableName = document.getElementById('tableSelect').value;
  const interval = parseInt(document.getElementById('intervalInput').value) || 60;
  
  if (!tableName) {
    document.getElementById('msg').innerHTML = '<div class="error">\u8BF7\u9009\u62E9\u8981\u540C\u6B65\u7684\u8868</div>';
    return;
  }
  
  const btn = this;
  btn.disabled = true;
  btn.textContent = '\u914D\u7F6E\u4E2D...';
  
  try {
    const config = {
      tableName: tableName,
      syncInterval: interval,
      source: 'caoliao-mysql'
    };
    await bitable.saveConfigAndGoNext(config);
    // SDK \u4F1A\u5173\u95ED\u7A97\u53E3 \u2014 \u540E\u7EED\u4EE3\u7801\u4E0D\u6267\u884C
  } catch(e) {
    document.getElementById('msg').innerHTML = '<div class="error">\u4FDD\u5B58\u5931\u8D25: ' + e.message + '</div>';
    btn.disabled = false;
    btn.textContent = '\u4FDD\u5B58\u914D\u7F6E\u5E76\u5F00\u59CB\u540C\u6B65';
  }
});
<\/script>
</body>
</html>`;


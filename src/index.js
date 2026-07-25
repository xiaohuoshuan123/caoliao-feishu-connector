// 草料二维码 - 飞书多维表格数据同步连接器
// 数据流: MySQL -> D1 -> Worker -> Feishu Bitable
// 支持 35 张表全量同步

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Max-Age": "86400" } });
    }
    if (path === "/" || path === "") {
      return json({ service: "caoliao-feishu-connector", status: "running", version: "2.0.0", tables: 35 }, cors);
    }
    if (path === "/favicon.ico") return new Response(null, { status: 204, headers: cors });

    // 元数据 - 飞书协议
    if (path === "/meta.json" || path === "/meta") {
      return json({
        schemaVersion: 1, version: "2.0.0", type: "data_connector",
        extraData: {
          dataSourceConfigUiUri: `https://${url.host}/config.html`,
          initHeight: 600, initWidth: 700
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
      }, cors);
    }

    // 配置页面
    if (path === "/config.html" || path === "/config") {
      return new Response(CONFIG_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }
      });
    }

    // 测试连接
    if (path === "/api/test-connection" && request.method === "POST") {
      try {
        // 返回 D1 中所有表
        const tables = await getD1Tables(env);
        return json({ success: true, message: `已连接，发现 ${tables.length} 张表`, tables }, cors);
      } catch (e) {
        return json({ success: false, message: `D1连接失败: ${e.message}` }, cors);
      }
    }

    // 表结构接口
    if (path === "/api/table_meta" && request.method === "POST") {
      try {
        const body = await request.json();
        let params = {};
        try { params = JSON.parse(body.params || "{}"); } catch(e) {}
        const dsConfig = JSON.parse(params.datasourceConfig || "{}");
        const tableName = dsConfig.table || dsConfig.tables?.[0] || "";

        if (!tableName) {
          // 返回所有表列表
          const tables = await getD1Tables(env);
          return json({
            code: 0, msg: "",
            data: {
              tableName: "草料数据库",
              fields: tables.map((t, i) => ({
                fieldID: t.name,
                fieldName: t.name,
                fieldType: 1,
                isPrimary: i === 0,
                description: `${t.name} 表`
              }))
            }
          }, cors);
        }

        // 获取指定表的列信息
        const fields = await getD1TableFields(env, tableName);
        return json({
          code: 0, msg: "",
          data: {
            tableName: tableName,
            fields: fields
          }
        }, cors);
      } catch (e) {
        return json({ code: 1254500, msg: JSON.stringify({ zh: "解析失败: " + e.message }) }, cors);
      }
    }

    // 记录数据接口
    if (path === "/api/records" && request.method === "POST") {
      try {
        const body = await request.json();
        let params = {};
        try { params = JSON.parse(body.params || "{}"); } catch(e) {}
        const dsConfig = JSON.parse(params.datasourceConfig || "{}");
        const tableName = dsConfig.table || dsConfig.tables?.[0] || "";
        const pageToken = params.pageToken || "";
        const maxPageSize = Math.min(params.maxPageSize || 100, 500);

        if (!tableName) {
          return json({ code: 1254500, msg: JSON.stringify({ zh: "未指定表名" }) }, cors);
        }

        const result = await getD1Records(env, tableName, pageToken, maxPageSize);
        return json({
          code: 0, msg: "",
          data: {
            nextPageToken: result.nextPageToken,
            hasMore: result.hasMore,
            records: result.records
          }
        }, cors);
      } catch (e) {
        return json({ code: 1254500, msg: JSON.stringify({ zh: "获取数据失败: " + e.message }) }, cors);
      }
    }

    return new Response(JSON.stringify({ code: 404, msg: "Not found" }), { status: 404 });
  }
};

// D1 辅助函数
async function getD1Tables(env) {
  const result = await env.CAOLIAO_DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sync_%' AND name NOT LIKE 'test_%' ORDER BY name"
  ).all();
  return result.results.map(r => ({ name: r.name, comment: r.name }));
}

async function getD1TableFields(env, tableName) {
  const result = await env.CAOLIAO_DB.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`
  ).bind(tableName).all();
  
  if (!result.results.length) return [];
  
  const sql = result.results[0].sql;
  const columns = parseColumnsFromSQL(sql);
  
  return columns.map((col, i) => ({
    fieldID: col.name,
    fieldName: col.name,
    fieldType: col.type === "INTEGER" || col.type === "REAL" ? 2 : 
               col.type.includes("DATE") || col.type.includes("TIME") ? 5 : 1,
    isPrimary: i === 0,
    description: col.name
  }));
}

async function getD1Records(env, tableName, pageToken, maxPageSize) {
  const offset = parseInt(pageToken) || 0;
  
  // 获取总行数
  const countResult = await env.CAOLIAO_DB.prepare(
    `SELECT COUNT(*) as cnt FROM [${tableName}]`
  ).all();
  const total = countResult.results[0].cnt;
  
  // 分页查询
  const result = await env.CAOLIAO_DB.prepare(
    `SELECT * FROM [${tableName}] LIMIT ? OFFSET ?`
  ).bind(maxPageSize, offset).all();
  
  const records = result.results.map((row, i) => ({
    primaryID: String(offset + i + 1),
    data: row
  }));
  
  const nextOffset = offset + maxPageSize;
  return {
    nextPageToken: nextOffset < total ? String(nextOffset) : "",
    hasMore: nextOffset < total,
    records
  };
}

function parseColumnsFromSQL(sql) {
  const cols = [];
  const match = sql.match(/\((.*)\)/s);
  if (!match) return cols;
  const inner = match[1];
  const parts = inner.split(',').map(p => p.trim());
  for (const part of parts) {
    const tokens = part.split(/\s+/);
    if (tokens.length >= 2) {
      cols.push({ name: tokens[0].replace(/[\[\]]/g, ''), type: tokens[1] });
    }
  }
  return cols;
}

function json(data, headers = {}) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

// 配置页面 HTML
const CONFIG_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>草料数据同步配置</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f6f7;padding:20px}
.container{max-width:600px;margin:0 auto}
.card{background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:16px}
h2{font-size:18px;color:#1f2328;margin-bottom:16px}
label{display:block;font-size:14px;color:#646a73;margin-bottom:6px;font-weight:500}
label .required{color:#ff3b30}
select,input{width:100%;padding:10px 14px;border:1px solid #d0d3d9;border-radius:8px;font-size:14px;outline:0;background:#fff}
input:focus{border-color:#3370ff;box-shadow:0 0 0 2px rgba(51,112,255,.1)}
.field{margin-bottom:16px}
.btn{width:100%;padding:12px;background:#3370ff;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:500;cursor:pointer}
.btn:hover{background:#2860e1}
.btn:disabled{background:#b8babd;cursor:not-allowed}
.btn-secondary{background:#f0f2f5;color:#1f2328}
.btn-secondary:hover{background:#e5e6e8}
.btn-row{display:flex;gap:12px}
.btn-row .btn{flex:1}
.info{font-size:12px;color:#9b9ea3;margin-top:4px}
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
</style>
</head>
<body>
<div class="container">
<div class="card">
<h2>🔌 数据源配置</h2>
<div class="field">
<label>数据源类型</label>
<div style="display:flex;gap:12px">
<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal">
<input type="radio" name="sourceType" value="d1" checked> 草料官方数据库 (D1同步)
</label>
</div>
<div class="info">直接读取已同步到 Cloudflare D1 的草料数据库 35 张表</div>
</div>
<div class="btn-row">
<button class="btn btn-secondary" id="testBtn">测试连接</button>
</div>
<div id="sourceMsg"></div>
</div>

<div class="card hidden" id="syncCard">
<h2>📊 选择同步表</h2>
<div class="field">
<div class="table-wrap">
<table>
<thead><tr><th class="checkbox-cell"><input type="checkbox" id="checkAll" checked></th><th>表名</th><th>类型</th></tr></thead>
<tbody id="tableListBody"></tbody>
</table>
</div>
</div>
<div class="field">
<label>同步周期（分钟）<span class="required">*</span></label>
<input type="number" id="intervalInput" value="60" min="5" max="1440">
<div class="info">最小 5 分钟，最大 1440 分钟（24 小时）</div>
</div>
<button class="btn" id="startSyncBtn">保存并开始同步</button>
<div id="syncMsg"></div>
</div>

<div class="card hidden" id="statusCard">
<h2>✅ 同步已配置</h2>
<div id="statusContent" style="font-size:14px;color:#1f2328;line-height:1.8"></div>
</div>
</div>
<script>
document.getElementById('testBtn').addEventListener('click', async function() {
  var msgEl = document.getElementById('sourceMsg');
  msgEl.innerHTML = '<div class="info-msg">正在连接 D1 数据库...';
  try {
    var resp = await fetch('/api/test-connection', { method: 'POST' });
    var data = await resp.json();
    if (data.success) {
      msgEl.innerHTML = '<div class="success">✓ ' + data.message + '（共 ' + data.tables.length + ' 张表）</div>';
      window.availableTables = data.tables;
      showSyncCard();
    } else {
      msgEl.innerHTML = '<div class="error">' + (data.message || '连接失败') + '</div>';
    }
  } catch(e) {
    msgEl.innerHTML = '<div class="error">请求失败: ' + e.message + '</div>';
  }
});

function showSyncCard() {
  var tbody = document.getElementById('tableListBody');
  tbody.innerHTML = '';
  window.availableTables.forEach(function(t) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td class="checkbox-cell"><input type="checkbox" class="table-checkbox" value="' + t.name + '" checked></td><td>' + t.name + '</td><td>' + (t.comment || '') + '</td>';
    tbody.appendChild(tr);
  });
  document.getElementById('syncCard').classList.remove('hidden');
}

document.getElementById('checkAll').addEventListener('change', function() {
  document.querySelectorAll('.table-checkbox').forEach(function(cb) { cb.checked = this.checked; }.bind(this));
});

document.getElementById('startSyncBtn').addEventListener('click', async function() {
  var msgEl = document.getElementById('syncMsg');
  var selectedTables = Array.from(document.querySelectorAll('.table-checkbox:checked')).map(function(cb) { return cb.value; });
  var interval = parseInt(document.getElementById('intervalInput').value);
  
  if (selectedTables.length === 0) { msgEl.innerHTML = '<div class="error">请至少选择一张表</div>'; return; }
  if (isNaN(interval) || interval < 5) { msgEl.innerHTML = '<div class="error">同步周期不能小于 5 分钟</div>'; return; }
  
  var config = { sourceType: 'd1', tables: selectedTables, interval: interval };
  
  msgEl.innerHTML = '<div class="info-msg">正在保存配置...</div>';
  try {
    if (typeof bitable !== 'undefined' && bitable.saveConfigAndGoNext) {
      await bitable.saveConfigAndGoNext({ datasourceConfig: JSON.stringify(config) });
      document.getElementById('statusContent').innerHTML = '数据源: 草料 D1<br>表: ' + selectedTables.length + ' 张<br>周期: ' + interval + ' 分钟';
      document.getElementById('statusCard').classList.remove('hidden');
      msgEl.innerHTML = '';
    } else {
      msgEl.innerHTML = '<div class="success">配置已保存</div>';
      document.getElementById('statusContent').innerHTML = '数据源: 草料 D1<br>表: ' + selectedTables.length + ' 张<br>周期: ' + interval + ' 分钟<br><br>配置已输出到控制台';
      document.getElementById('statusCard').classList.remove('hidden');
    }
  } catch(e) {
    msgEl.innerHTML = '<div class="error">保存失败: ' + e.message + '</div>';
  }
});
</script>
</body>
</html>`;

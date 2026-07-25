// Pages Functions API - 获取表字段
export async function onRequest(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const body = await request.json();
    let params = {};
    try { params = JSON.parse(body.params || "{}"); } catch(e) {}
    const dsConfig = JSON.parse(params.datasourceConfig || "{}");
    const tableName = dsConfig.table || dsConfig.tables?.[0] || "";
    
    if (!tableName) {
      const tables = await getD1Tables(env);
      return new Response(JSON.stringify({
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
      }), { headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders } });
    }
    
    const fields = await getD1TableFields(env, tableName);
    return new Response(JSON.stringify({
      code: 0, msg: "",
      data: { tableName, fields }
    }), { headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ code: 1254500, msg: JSON.stringify({ zh: "解析失败: " + e.message }) }), {
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
    });
  }
}

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
    fieldType: col.type === "INTEGER" || col.type === "REAL" ? 2 : col.type.includes("DATE") || col.type.includes("TIME") ? 5 : 1,
    isPrimary: i === 0,
    description: col.name
  }));
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

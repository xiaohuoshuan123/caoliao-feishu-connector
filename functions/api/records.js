// Pages Functions API - 获取记录
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
    const pageToken = params.pageToken || "";
    const maxPageSize = Math.min(params.maxPageSize || 100, 500);
    
    if (!tableName) {
      return new Response(JSON.stringify({ code: 1254500, msg: JSON.stringify({ zh: "未指定表名" }) }), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
      });
    }
    
    const offset = parseInt(pageToken) || 0;
    const countResult = await env.CAOLIAO_DB.prepare(
      `SELECT COUNT(*) as cnt FROM [${tableName}]`
    ).all();
    const total = countResult.results[0].cnt;
    const result = await env.CAOLIAO_DB.prepare(
      `SELECT * FROM [${tableName}] LIMIT ? OFFSET ?`
    ).bind(maxPageSize, offset).all();
    const records = result.results.map((row, i) => ({
      primaryID: String(offset + i + 1),
      data: row
    }));
    const nextOffset = offset + maxPageSize;
    return new Response(JSON.stringify({
      code: 0, msg: "",
      data: {
        nextPageToken: nextOffset < total ? String(nextOffset) : "",
        hasMore: nextOffset < total,
        records
      }
    }), { headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ code: 1254500, msg: JSON.stringify({ zh: "获取数据失败: " + e.message }) }), {
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
    });
  }
}

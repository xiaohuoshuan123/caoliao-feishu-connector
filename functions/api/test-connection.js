// Pages Functions API - 测试连接
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
    const result = await env.CAOLIAO_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sync_%' AND name NOT LIKE 'test_%' ORDER BY name"
    ).all();
    const tables = result.results.map(r => ({ name: r.name, comment: r.name }));
    return new Response(JSON.stringify({ success: true, message: `已连接，发现 ${tables.length} 张表`, tables }), {
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: `D1连接失败: ${e.message}` }), {
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
    });
  }
}

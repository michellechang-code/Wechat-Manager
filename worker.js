// ╔══════════════════════════════════════════════════════════════╗
// ║  微信訊息管理系統 — Cloudflare Worker (Gemini API Proxy)    ║
// ║                                                              ║
// ║  部署說明：                                                  ║
// ║  1. 登入 https://dash.cloudflare.com                        ║
// ║  2. 進入你的 Worker (withered-sound-43b8)                   ║
// ║  3. 點「Edit Code」，清空原本程式碼，貼入這份               ║
// ║  4. 點「Save and Deploy」                                    ║
// ║  5. 進 Settings → Variables and Secrets → 新增：            ║
// ║     GEMINI_API_KEY = 你的 Gemini API Key (AIza...)          ║
// ╚══════════════════════════════════════════════════════════════╝

export default {
  async fetch(request, env) {

    // ── CORS preflight ──────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: corsHeaders()
      });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set in Worker environment variables' }), {
        status: 500, headers: corsHeaders()
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: corsHeaders()
      });
    }

    // ── 從前端格式轉成 Gemini 格式 ─────────────────────────────
    // 前端送來的格式：{ system, messages: [{role, content}] }
    const systemPrompt = body.system || '';
    const userMsg = (body.messages || []).find(m => m.role === 'user');
    const userText = userMsg ? userMsg.content : '';

    const geminiBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: systemPrompt + '\n\n---\n\n' + userText }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1200,
      }
    };

    try {
      const geminiResp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody)
        }
      );

      const geminiData = await geminiResp.json();

      if (!geminiResp.ok) {
        return new Response(JSON.stringify({ error: geminiData }), {
          status: geminiResp.status, headers: corsHeaders()
        });
      }

      // ── 把 Gemini 回應轉成前端期望的 Claude 格式 ───────────
      const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const converted = {
        content: [{ type: 'text', text: text }]
      };

      return new Response(JSON.stringify(converted), {
        status: 200, headers: corsHeaders()
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: 'Gemini API call failed: ' + e.message }), {
        status: 500, headers: corsHeaders()
      });
    }
  }
};

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}


import { getVercelOidcToken } from '@vercel/oidc';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const token = process.env.AI_GATEWAY_API_KEY || await getVercelOidcToken().catch(() => null) || process.env.VERCEL_OIDC_TOKEN;
    if (!token) return res.status(503).json({ ok: false, error: 'ai_auth_unavailable' });
    const response = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-5.6-sol',
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Return exactly the word OK.' }] }]
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ ok: false, error: 'gateway_error', status: response.status, detail: body?.error?.message || null });
    return res.status(200).json({ ok: true, gateway: true, auth: process.env.AI_GATEWAY_API_KEY ? 'api-key' : 'oidc' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'health_failed', detail: error?.message || String(error) });
  }
}

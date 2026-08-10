import { getVercelOidcToken } from '@vercel/oidc';

const MAX_BYTES = 3 * 1024 * 1024;

const extractionPrompt = `Du är Never Overpays svenska elräkningsanalysmotor. Läs dokumentet noggrant och returnera ENDAST giltig JSON, utan markdown.

Extrahera bara sådant som faktiskt stöds av dokumentet. Gissa aldrig. Sätt null när något saknas eller är osäkert.

JSON-format:
{
  "category": "electricity",
  "supplier": string|null,
  "invoicePeriod": string|null,
  "postalCode": string|null,
  "biddingZone": "SE1"|"SE2"|"SE3"|"SE4"|null,
  "annualConsumptionKwh": number|null,
  "periodConsumptionKwh": number|null,
  "contractType": "fixed"|"monthly"|"hourly"|"quarter-hourly"|"mixed"|null,
  "spotPriceOrePerKwh": number|null,
  "energyPriceOrePerKwh": number|null,
  "markupOrePerKwh": number|null,
  "variableCostOrePerKwh": number|null,
  "fixedTradingFeeSekPerMonth": number|null,
  "vatSek": number|null,
  "electricityTradingTotalSek": number|null,
  "gridCompany": string|null,
  "gridTotalSek": number|null,
  "invoiceTotalSek": number|null,
  "contractNotes": string|null,
  "confidence": {
    "supplier": number,
    "invoicePeriod": number,
    "periodConsumptionKwh": number,
    "contractType": number,
    "spotPriceOrePerKwh": number,
    "markupOrePerKwh": number,
    "variableCostOrePerKwh": number,
    "fixedTradingFeeSekPerMonth": number,
    "electricityTradingTotalSek": number
  },
  "evidence": [
    {"field": string, "value": string, "sourceText": string}
  ],
  "warnings": [string]
}

Regler:
- Alla priser per kWh ska anges i öre/kWh oavsett om fakturan visar kr/kWh eller öre/kWh.
- Separera elhandel från elnät.
- För Tibber-liknande fakturor: läs spotpris, fast påslag, rörliga kostnader, månadsavgift och moms separat när de finns.
- Om en rad anger exempelvis 683,44 kWh x 0,5929 kr/kWh = 405,20 kr ska spotPriceOrePerKwh bli 59,29.
- Moms får inte dubbelräknas.
- confidence ska ligga 0–1.
- evidence ska innehålla korta textbevis för centrala extraktioner men aldrig personnummer, OCR-nummer, bankgiro eller fullständiga adresser.
- Om dokumentet inte är en svensk elräkning, lägg en tydlig varning i warnings.`;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

function extractText(result) {
  if (typeof result?.output_text === 'string') return result.output_text;
  for (const item of result?.output || []) {
    if (item?.type !== 'message') continue;
    for (const part of item.content || []) if (typeof part?.text === 'string') return part.text;
  }
  return null;
}

async function getGatewayToken() {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    const oidc = await getVercelOidcToken();
    if (oidc) return oidc;
  } catch (error) {
    console.error('OIDC token unavailable', error?.message || error);
  }
  return process.env.VERCEL_OIDC_TOKEN || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  try {
    const { fileName, mimeType, dataUrl } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') return json(res, 400, { error: 'missing_file' });
    if (!/^data:(application\/pdf|image\/(png|jpeg|jpg|webp));base64,/.test(dataUrl)) return json(res, 400, { error: 'unsupported_file_type' });
    const base64 = dataUrl.split(',')[1] || '';
    if (Math.floor(base64.length * 0.75) > MAX_BYTES) return json(res, 413, { error: 'file_too_large' });

    const token = await getGatewayToken();
    if (!token) return json(res, 503, { error: 'ai_auth_unavailable' });

    const isPdf = (mimeType || '').includes('pdf') || dataUrl.startsWith('data:application/pdf');
    const attachment = isPdf
      ? { type: 'input_file', filename: fileName || 'elrakning.pdf', file_data: dataUrl }
      : { type: 'input_image', image_url: dataUrl };

    const gatewayResponse = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-5.6-sol',
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: extractionPrompt }, attachment] }]
      })
    });

    const raw = await gatewayResponse.json().catch(() => ({}));
    if (!gatewayResponse.ok) {
      console.error('AI Gateway error', gatewayResponse.status, raw?.error?.message || raw?.error || 'unknown');
      return json(res, 502, { error: 'analysis_provider_error', providerStatus: gatewayResponse.status });
    }

    const text = extractText(raw);
    if (!text) return json(res, 502, { error: 'empty_analysis' });
    let analysis;
    try {
      analysis = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    } catch {
      return json(res, 502, { error: 'invalid_analysis_format' });
    }

    return json(res, 200, { ok: true, analysis, meta: { live: true, auth: process.env.AI_GATEWAY_API_KEY ? 'api-key' : 'oidc', generatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('Analyze energy failed', error?.message || error);
    return json(res, 500, { error: 'analysis_failed' });
  }
}

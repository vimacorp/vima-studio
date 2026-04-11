// api/generate-video.js
// VIMA STUDIO - Real product demo video via Kling 2.1 (PiAPI)
// Pipeline: product image -> tmpfiles host -> Claude prompt -> Kling i2v -> hosted MP4 URL

export const config = { maxDuration: 300 };

const PIAPI_BASE = 'https://api.piapi.ai/api/v1';

function stripDataPrefix(b64) {
  return String(b64 || '').replace(/^data:image\/[^;]+;base64,/, '');
}

async function uploadToTmpfiles(base64, mime) {
  const buffer = Buffer.from(base64, 'base64');
  const ext = (mime || 'image/jpeg').split('/')[1] || 'jpg';
  const blob = new Blob([buffer], { type: mime || 'image/jpeg' });
  const fd = new FormData();
  fd.append('file', blob, `vima-${Date.now()}.${ext}`);
  const r = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`tmpfiles upload failed: HTTP ${r.status}`);
  const j = await r.json();
  const url = j?.data?.url;
  if (!url) throw new Error('tmpfiles: no url in response: ' + JSON.stringify(j));
  // tmpfiles returns viewer URL; direct download = inject /dl/
  return url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
}

async function buildDemoPrompt({ productName, productDescription, marketplace }) {
  const sys = 'You generate a single short cinematic prompt for an image-to-video model (Kling 2.1). The prompt describes natural product motion and camera movement that demonstrates the product in real use. RULES: no text overlays, no logos, no human faces, no hands holding the product unless natural, single paragraph, <80 words, English, premium commercial style.';
  const user = `Product: ${productName}\nDescription: ${productDescription || '(none)'}\nMarketplace: ${marketplace || 'Mercado Livre'}\n\nWrite ONE cinematic camera+motion prompt that demonstrates this product visually. Output only the prompt, no preamble.`;
  try {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('no anthropic key');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: sys,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (r.ok) {
      const j = await r.json();
      const text = j?.content?.[0]?.text?.trim();
      if (text) return text.replace(/^["']|["']$/g, '');
    }
  } catch (e) {
    console.warn('buildDemoPrompt fallback:', e?.message || e);
  }
  return `Slow cinematic dolly-in shot of ${productName}, soft natural lighting, subtle ambient motion, product centered, premium commercial style, smooth camera movement, ultra detailed, 9:16 vertical`;
}

async function createKlingTask({ prompt, imageUrl, duration }) {
  const body = {
    model: 'kling',
    task_type: 'video_generation',
    input: {
      prompt,
      negative_prompt: 'low quality, distorted, watermark, text, logo, deformed product, blurry, extra limbs',
      cfg_scale: 0.5,
      duration: duration || 5,
      aspect_ratio: '9:16',
      image_url: imageUrl,
      version: '2.1',
      mode: 'std'
    },
    config: { service_mode: '', webhook_config: {} }
  };
  const r = await fetch(`${PIAPI_BASE}/task`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.PIAPI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`PiAPI create task failed (${r.status}): ${t}`);
  }
  const j = await r.json();
  const taskId = j?.data?.task_id || j?.task_id;
  if (!taskId) throw new Error('PiAPI: no task_id: ' + JSON.stringify(j));
  return taskId;
}

async function pollKlingTask(taskId, { timeoutMs = 270000, intervalMs = 6000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
      headers: { 'x-api-key': process.env.PIAPI_KEY }
    });
    if (r.ok) {
      const j = await r.json();
      const data = j?.data || j;
      const status = String(data?.status || '').toLowerCase();
      if (status === 'completed') {
        const out = data?.output || {};
        const url =
          out.video_url ||
          out.works?.[0]?.video?.resource ||
          out.works?.[0]?.video?.resource_without_watermark ||
          out.url;
        if (!url) throw new Error('No video url in completed task: ' + JSON.stringify(out));
        return url;
      }
      if (status === 'failed') {
        throw new Error('Kling task failed: ' + JSON.stringify(data?.error || data));
      }
    }
    await new Promise(res => setTimeout(res, intervalMs));
  }
  throw new Error('Kling task timed out after ' + timeoutMs + 'ms');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.PIAPI_KEY) return res.status(500).json({ error: 'PIAPI_KEY not configured in Vercel env' });

  try {
    const body = req.body || {};
    const imageBase64 = stripDataPrefix(body.imageBase64 || body.image);
    const imageMime = body.imageMime || 'image/jpeg';
    const productName = body.productName || 'produto';
    const productDescription = body.productDescription || '';
    const marketplace = body.marketplace || 'Mercado Livre';
    const duration = Math.min(10, Math.max(5, Number(body.duration) || 5));

    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    const imageUrl = await uploadToTmpfiles(imageBase64, imageMime);
    const prompt = await buildDemoPrompt({ productName, productDescription, marketplace });
    const taskId = await createKlingTask({ prompt, imageUrl, duration });
    const videoUrl = await pollKlingTask(taskId);

    return res.status(200).json({
      success: true,
      videoUrl,
      taskId,
      prompt,
      sourceImageUrl: imageUrl,
      duration,
      aspectRatio: '9:16',
      provider: 'kling-2.1-via-piapi'
    });
  } catch (err) {
    console.error('generate-video error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

// api/generate-influencer.js
// VIMA STUDIO - Real "AI Influencer" demo video.
// Pipeline:
//   product image -> tmpfiles host
//   -> Freepik Flux Kontext (generate still: realistic person using product)
//   -> Kling 2.1 i2v (animate the still)
//   -> hosted MP4 URL

export const config = { maxDuration: 300 };

const PIAPI_BASE = 'https://api.piapi.ai/api/v1';
const FREEPIK_BASE = 'https://api.freepik.com/v1';

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
  return url.replace(/^https?:\/\/tmpfiles\.org\//, 'https://tmpfiles.org/dl/');
}

async function fetchAsBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch image failed: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.toString('base64');
}

async function buildInfluencerStillPrompt({ productName, productDescription, marketplace }) {
  const sys = 'You write a single concise prompt for an image generation model that edits an existing product image into a realistic lifestyle photo of a person actually USING the product. Rules: Brazilian context, natural daylight, no text overlays, no logos, photorealistic, single paragraph, <70 words, English. Describe the scene, the person (gender/age range only, no facial features), the action of using the product, the environment, and lighting.';
  const user = `Product: ${productName}\nDescription: ${productDescription || '(none)'}\nMarketplace: ${marketplace || 'Mercado Livre'}\n\nWrite ONE prompt to transform the product image into a lifestyle photo of a person using the product. Output only the prompt.`;
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
    console.warn('influencer still prompt fallback:', e?.message || e);
  }
  return `Photorealistic Brazilian lifestyle photo of a young adult naturally using ${productName} at home, soft natural daylight, casual outfit, candid composition, modern apartment background, product clearly visible and in focus, premium commercial photography style`;
}

async function buildInfluencerMotionPrompt({ productName }) {
  return `Subtle natural body motion of the person interacting with ${productName}, soft camera dolly-in, realistic micro-expressions, premium commercial style, no text, no logos, 9:16 vertical`;
}

async function freepikFluxKontextEdit({ imageBase64, prompt }) {
  // Freepik Flux Kontext: edit/transform an existing image with a text prompt
  if (!process.env.FREEPIK_API_KEY) throw new Error('FREEPIK_API_KEY not configured');
  const inputImageUrl = await uploadToTmpfiles(imageBase64, 'image/jpeg');
  const body = {
    prompt,
    input_image: inputImageUrl,
    aspect_ratio: 'social_story_9_16'
  };
  const r = await fetch(`${FREEPIK_BASE}/ai/text-to-image/flux-kontext-pro`, {
    method: 'POST',
    headers: {
      'x-freepik-api-key': process.env.FREEPIK_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Freepik Flux Kontext failed (${r.status}): ${t}`);
  }
  const j = await r.json();
  // Async task pattern
  const taskId = j?.data?.task_id || j?.task_id;
  if (taskId) return { taskId, raw: j };
  // Or sync image data
  const b64 = j?.data?.[0]?.base64 || j?.data?.image || j?.image;
  if (b64) return { base64: b64 };
  throw new Error('Freepik Flux Kontext: unexpected response: ' + JSON.stringify(j).slice(0, 400));
}

async function pollFreepikTask(taskId, { timeoutMs = 120000, intervalMs = 4000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${FREEPIK_BASE}/ai/text-to-image/flux-kontext-pro/${taskId}`, {
      headers: { 'x-freepik-api-key': process.env.FREEPIK_API_KEY }
    });
    if (r.ok) {
      const j = await r.json();
      const data = j?.data || j;
      const status = String(data?.status || '').toLowerCase();
      if (status === 'completed' || status === 'success' || status === 'done') {
        const url = data?.generated?.[0] || data?.images?.[0]?.url || data?.image_url || data?.url;
        if (url) return { url };
        const b64 = data?.images?.[0]?.base64 || data?.base64;
        if (b64) return { base64: b64 };
        throw new Error('Freepik task completed but no image: ' + JSON.stringify(data).slice(0, 300));
      }
      if (status === 'failed' || status === 'error') {
        throw new Error('Freepik task failed: ' + JSON.stringify(data));
      }
    }
    await new Promise(res => setTimeout(res, intervalMs));
  }
  throw new Error('Freepik task timed out after ' + timeoutMs + 'ms');
}

async function createKlingTask({ prompt, imageUrl, duration }) {
  const body = {
    model: 'kling',
    task_type: 'video_generation',
    input: {
      prompt,
      negative_prompt: 'low quality, distorted, watermark, text, logo, deformed, blurry, extra limbs, ugly face',
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

async function pollKlingTask(taskId, { timeoutMs = 240000, intervalMs = 6000 } = {}) {
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
  if (!process.env.PIAPI_KEY) return res.status(500).json({ error: 'PIAPI_KEY not configured' });
  if (!process.env.FREEPIK_API_KEY) return res.status(500).json({ error: 'FREEPIK_API_KEY not configured' });

  try {
    const body = req.body || {};
    const imageBase64 = stripDataPrefix(body.imageBase64 || body.image);
    const imageMime = body.imageMime || 'image/jpeg';
    const productName = body.productName || 'produto';
    const productDescription = body.productDescription || '';
    const marketplace = body.marketplace || 'Mercado Livre';
    const duration = Math.min(10, Math.max(5, Number(body.duration) || 5));

    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    // 1. Generate the lifestyle still: person using the product
    const stillPrompt = await buildInfluencerStillPrompt({ productName, productDescription, marketplace });
    const stillTask = await freepikFluxKontextEdit({ imageBase64, prompt: stillPrompt });
    let stillBase64 = stillTask.base64;
    let stillUrl;
    if (!stillBase64 && stillTask.taskId) {
      const polled = await pollFreepikTask(stillTask.taskId);
      if (polled.url) {
        stillUrl = polled.url;
      } else if (polled.base64) {
        stillBase64 = polled.base64;
      }
    }
    // 2. Make sure we have a public URL for Kling
    if (!stillUrl) {
      if (!stillBase64) throw new Error('No still image produced by Freepik');
      stillUrl = await uploadToTmpfiles(stillBase64, 'image/jpeg');
    }

    // 3. Animate via Kling
    const motionPrompt = await buildInfluencerMotionPrompt({ productName });
    const taskId = await createKlingTask({ prompt: motionPrompt, imageUrl: stillUrl, duration });
    const videoUrl = await pollKlingTask(taskId);

    return res.status(200).json({
      success: true,
      videoUrl,
      taskId,
      stillImageUrl: stillUrl,
      stillPrompt,
      motionPrompt,
      duration,
      aspectRatio: '9:16',
      provider: 'freepik-flux-kontext + kling-2.1-via-piapi'
    });
  } catch (err) {
    console.error('generate-influencer error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

// api/render-probe.js
// Diagnostic: POST a test image and probe both Freepik and Photoroom directly,
// returning the raw responses so we can see exactly why they are failing.

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { imageBase64, imageMime = 'image/png' } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

  const out = { freepik: null, photoroom: null };

  // --- Freepik test ---
  try {
    const key = process.env.FREEPIK_API_KEY;
    if (!key) { out.freepik = { error: 'no key' }; }
    else {
      const r = await fetch('https://api.freepik.com/v1/ai/image-to-image/flux-dev', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-freepik-api-key': key,
        },
        body: JSON.stringify({
          image: `data:${imageMime};base64,${imageBase64}`,
          prompt: 'product on clean white studio background, professional lighting',
          negative_prompt: 'text, watermark, logo',
          guidance_scale: 0.7,
          num_inference_steps: 28,
          aspect_ratio: '1:1',
        }),
      });
      const txt = await r.text();
      let parsed = null;
      try { parsed = JSON.parse(txt); } catch {}
      out.freepik = {
        status: r.status,
        ok: r.ok,
        bodyPreview: txt.slice(0, 1500),
        parsed,
      };
    }
  } catch (e) {
    out.freepik = { error: e.message, stack: e.stack && e.stack.slice(0, 500) };
  }

  // --- Photoroom test ---
  try {
    const key = process.env.PHOTOROOM_API_KEY;
    if (!key) { out.photoroom = { error: 'no key' }; }
    else {
      const bin = Buffer.from(imageBase64, 'base64');
      const blob = new Blob([bin], { type: imageMime });
      const form = new FormData();
      form.append('imageFile', blob, 'product.png');
      form.append('background.prompt', 'clean white studio background');
      form.append('outputSize', '1200x1200');
      const r = await fetch('https://image-api.photoroom.com/v2/edit', {
        method: 'POST',
        headers: { 'x-api-key': key },
        body: form,
      });
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('image')) {
        out.photoroom = { status: r.status, ok: r.ok, contentType: ct, note: 'binary image' };
      } else {
        const txt = await r.text();
        out.photoroom = { status: r.status, ok: r.ok, contentType: ct, bodyPreview: txt.slice(0, 1500) };
      }
    }
  } catch (e) {
    out.photoroom = { error: e.message, stack: e.stack && e.stack.slice(0, 500) };
  }

  res.status(200).json(out);
}

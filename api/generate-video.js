// api/generate-video.js
// VIMA STUDIO - Video comercial multi-cena (30s) narrado via Kling 2.1 (PiAPI)
// Pipeline: product image -> tmpfiles host -> Claude storyboard (6 cenas + narração) -> Kling i2v paralelo -> playlist {videoUrl, narration}

export const config = { maxDuration: 300 };

const PIAPI_BASE = 'https://api.piapi.ai/api/v1';

function stripDataPrefix(b64) {
  return String(b64 || '').replace(/^data:image\/[^;]+;base64,/, '');
}

async function uploadToTmpfiles(base64, mime) {
  const clean = stripDataPrefix(base64);
  const buf = Buffer.from(clean, 'base64');
  const ext = (mime && mime.split('/')[1]) || 'png';
  const blob = new Blob([buf], { type: mime || 'image/png' });
  const fd = new FormData();
  fd.append('file', blob, `vima-${Date.now()}.${ext}`);
  const r = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`tmpfiles upload failed: HTTP ${r.status}`);
  const j = await r.json();
  const url = j?.data?.url;
  if (!url) throw new Error('tmpfiles: no url in response: ' + JSON.stringify(j));
  return url.replace(/^https?:\/\/tmpfiles\.org\//, 'https://tmpfiles.org/dl/');
}

async function buildStoryboard({ productName, productDescription, marketplace }) {
  const sys = 'Voce cria storyboards curtos para videos comerciais de e-commerce. Responda APENAS com JSON valido, sem markdown.';
  const user = `Produto: ${productName}
Descricao: ${productDescription || '(sem descricao)'}
Marketplace: ${marketplace || 'Mercado Livre'}

Crie um storyboard de 6 cenas (cada cena tem 5 segundos de video = 30 segundos no total) para um video de vendas persuasivo.
Cada cena deve ter:
- "prompt": prompt cinematografico curto em ingles para Kling 2.1 image-to-video (camera, iluminacao, movimento, ambientacao). O produto DEVE ser identico a imagem de referencia. Sem texto, sem logos, sem deformacoes.
- "narration": texto de narracao em portugues brasileiro (MAXIMO 13 palavras por cena, ~5 segundos falado).

Estrutura persuasiva:
Cena 1 - HOOK (quebra o scroll, produto em destaque)
Cena 2 - PROBLEMA (contexto do uso, dor que resolve)
Cena 3 - SOLUCAO (produto em acao)
Cena 4 - BENEFICIO (resultado visivel)
Cena 5 - PROVA (detalhes premium, qualidade)
Cena 6 - CTA (fechamento emocional com produto)

Responda APENAS o JSON: {"scenes":[{"prompt":"...","narration":"..."},...6 cenas]}`;

  const fallback = [
    { prompt: `Slow dolly-in on ${productName}, soft studio lighting, product centered, premium commercial style`, narration: `Conheca o ${productName}.` },
    { prompt: `Top-down reveal of ${productName} in everyday context, natural daylight`, narration: 'Feito para o seu dia a dia.' },
    { prompt: `Close-up hand interacting with ${productName}, shallow depth of field`, narration: 'Pratico e facil de usar.' },
    { prompt: `Wide shot showing ${productName} in use, cinematic lighting`, narration: 'Resultado que voce sente na hora.' },
    { prompt: `Macro detail of ${productName} material and finish, premium quality`, narration: 'Qualidade premium em cada detalhe.' },
    { prompt: `Hero shot of ${productName}, warm golden hour light, emotional close-up`, narration: 'Garanta o seu agora.' }
  ];

  try {
    if (!process.env.ANTHROPIC_API_KEY) return fallback;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: sys,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!r.ok) return fallback;
    const j = await r.json();
    const text = j?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed?.scenes) && parsed.scenes.length >= 4) {
      return parsed.scenes.slice(0, 6).map(s => ({
        prompt: String(s.prompt || '').slice(0, 500),
        narration: String(s.narration || '').slice(0, 180)
      }));
    }
  } catch (e) {
    console.warn('buildStoryboard fallback:', e?.message || e);
  }
  return fallback;
}

async function createKlingTask({ prompt, imageUrl, duration }) {
  const body = {
    model: 'kling',
    task_type: 'video_generation',
    input: {
      prompt,
      negative_prompt: 'low quality, distorted, watermark, text, logo, deformed product, blurry, extra limbs, brand change',
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

async function pollKlingTask(taskId, { timeoutMs = 260000, intervalMs = 6000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
      headers: { 'x-api-key': process.env.PIAPI_KEY }
    });
    if (r.ok) {
      const j = await r.json();
      const data = j?.data || j;
      const status = data?.status;
      if (status === 'completed') {
        const out = data.output || {};
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
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Kling task timed out after ' + timeoutMs + 'ms');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.PIAPI_KEY) return res.status(500).json({ error: 'PIAPI_KEY not configured in Vercel env' });

  try {
    const { imageBase64, listing, marketplace } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    const productName = listing?.title || listing?.productName || 'produto';
    const productDescription = listing?.description || listing?.bullets?.join?.('. ') || '';

    const imageUrl = await uploadToTmpfiles(imageBase64, 'image/png');
    const storyboard = await buildStoryboard({ productName, productDescription, marketplace });

    // Paralelizar criacao e polling das 6 cenas para caber em 300s
    const scenePromises = storyboard.map(async (scene, idx) => {
      try {
        const taskId = await createKlingTask({ prompt: scene.prompt, imageUrl, duration: 5 });
        const videoUrl = await pollKlingTask(taskId);
        return { idx, videoUrl, prompt: scene.prompt, narration: scene.narration, duration: 5 };
      } catch (e) {
        console.error(`Cena ${idx+1} falhou:`, e?.message || e);
        return { idx, error: String(e?.message || e), prompt: scene.prompt, narration: scene.narration, duration: 5 };
      }
    });

    const results = await Promise.all(scenePromises);
    const ok = results.filter(r => r.videoUrl);
    if (ok.length === 0) {
      return res.status(500).json({ error: 'Todas as cenas falharam', details: results });
    }

    return res.status(200).json({
      success: true,
      scenes: results.sort((a,b)=>a.idx-b.idx),
      totalDuration: ok.length * 5,
      sourceImageUrl: imageUrl,
      productName,
      provider: 'kling-2.1-via-piapi',
      sceneCount: ok.length
    });
  } catch (err) {
    console.error('generate-video error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

// api/generate-scenes-v2.js
// VIMA STUDIO — New scene generation endpoint (Wave 1 pipeline)
//
// Differences from the old api/generate-scenes.js:
//   - No hardcoded SCENES array.
//   - Runs Stage 1 (Visual Analyst) before anything.
//   - Runs Stage 7 (Creative Director) to plan custom scenes.
//   - Then renders each planned scene through Freepik/Photoroom, same as before.
//
// Contract:
//   POST /api/generate-scenes-v2
//   Body: { imageBase64, imageMime?, productName?, productDescription?, package?, marketplace? }
//   Returns: { runId, visualAnalysis, scenePlan, scenes:[{id,name,aspectRatio,imageUrl,status,error?}], timeline }
//
// NOTE: The frontend can keep calling /api/generate-scenes (old) for now.
//       Point it at /api/generate-scenes-v2 when you're ready to flip the switch.

import { createContext, runStage } from './pipeline/context.js';
import { runVisualAnalyst } from './pipeline/stage1-visual-analyst.js';
import { runCreativeDirector } from './pipeline/stage7-creative-director.js';
import { runImageQualityCritic } from './pipeline/stage9-image-quality.js';
import { runBrandVoiceAgent } from './pipeline/stage10-brand-voice.js';

export const config = {
  maxDuration: 300, // 5 min — scene rendering can take a while
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    // Accept either `imageBase64` (new contract) or `image` (legacy frontend)
    const imageBase64 = body.imageBase64 || body.image;
    // Auto-detect mime from base64 magic bytes (PNG/JPEG/GIF/WebP)
        const detectMimeFromBase64 = (b64) => {
          if (!b64) return 'image/jpeg';
          const clean = b64.replace(/^data:[^;]+;base64,/, '');
          const head = clean.slice(0, 16);
          if (head.startsWith('iVBOR')) return 'image/png';
          if (head.startsWith('/9j/')) return 'image/jpeg';
          if (head.startsWith('R0lGOD')) return 'image/gif';
          if (head.startsWith('UklGR')) return 'image/webp';
          return 'image/jpeg';
        };
        const imageMime = body.imageMime || detectMimeFromBase64(imageBase64);
    const productName = body.productName || '';
    const productDescription = body.productDescription || '';
    const pkg = body.package || 'LITE';
    const marketplace = body.marketplace || 'mercadolivre';

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 (or image) is required' });
    }

    const ctx = createContext({
      imageBase64,
      imageMime,
      productName,
      productDescription,
      marketplace,
    });

    // --- Stage 1: Visual Analyst ---------------------------------------------
    await runStage(ctx, 'stage1-visual-analyst', (c) => runVisualAnalyst(c));

    // --- Stage 7: Creative Director ------------------------------------------
    await runStage(ctx, 'stage7-creative-director', (c) =>
      runCreativeDirector(c, { package: pkg })
    );

    // --- Stage 8: Scene Rendering (parallel) ---------------------------------
    // Uses Freepik Reimagine Flux as primary, Photoroom as fallback,
    // SVG placeholder as last resort. Same strategy the old endpoint had.
    await runStage(ctx, 'stage8-scene-rendering', async (c) => {
      const settled = await Promise.allSettled(
        c.scenePlan.scenes.map((scene) => renderScene(c, scene))
      );
      c.renderedScenes = settled.map((r, i) => {
        const scene = c.scenePlan.scenes[i];
        if (r.status === 'fulfilled') {
          return { ...scene, ...r.value, status: 'ok' };
        }
        return {
          ...scene,
          imageUrl: null,
          status: 'error',
          error: r.reason?.message || String(r.reason),
        };
      });
    });

    // --- Stage 9: Image Quality Critic + Regen loop (Wave 2) -----------------
    // Claude vision scores every rendered scene. Scenes that fail get ONE
    // retry with adjusted prompts coming from the critic.
    await runStage(ctx, 'stage9-image-quality', (c) => runImageQualityCritic(c));

    const failed = (ctx.qualityReport?.results || []).filter((r) => r.pass === false);
    if (failed.length > 0) {
      await runStage(ctx, 'stage9-regen', async (c) => {
        const byId = new Map(c.renderedScenes.map((s) => [s.id, s]));
        const jobs = failed
          .map((fr) => {
            const original = byId.get(fr.sceneId);
            if (!original) return null;
            const patched = {
              ...original,
              promptEn: fr.fixes?.promptEn
                ? `${original.promptEn}. ${fr.fixes.promptEn}`
                : original.promptEn,
              negativePromptEn: fr.fixes?.negativePromptEn
                ? `${original.negativePromptEn || ''} ${fr.fixes.negativePromptEn}`.trim()
                : original.negativePromptEn,
            };
            return { sceneId: fr.sceneId, patched };
          })
          .filter(Boolean);

        const results = await Promise.allSettled(
          jobs.map((j) => renderScene(c, j.patched))
        );

        results.forEach((r, i) => {
          const id = jobs[i].sceneId;
          const idx = c.renderedScenes.findIndex((s) => s.id === id);
          if (idx < 0) return;
          if (r.status === 'fulfilled') {
            c.renderedScenes[idx] = {
              ...c.renderedScenes[idx],
              ...r.value,
              status: 'ok-retry',
              regenerated: true,
            };
          } else {
            c.renderedScenes[idx] = {
              ...c.renderedScenes[idx],
              regenerated: true,
              regenError: r.reason?.message || String(r.reason),
            };
          }
        });

        return { retried: jobs.length };
      });
    }

    // --- Stage 10: Brand Voice Agent (Wave 3) ------------------------------
    // Gera título, bullets, descrição e keywords para o marketplace alvo.
    // Roda em paralelo seria ideal, mas depende da visualAnalysis então fica
    // no final do pipeline (rápido — só uma chamada de texto).
    await runStage(ctx, 'stage10-brand-voice', (c) => runBrandVoiceAgent(c));

    return res.status(200).json({
      runId: ctx.runId,
      visualAnalysis: ctx.visualAnalysis,
      scenePlan: ctx.scenePlan,
      scenes: ctx.renderedScenes,
      qualityReport: ctx.qualityReport,
      copy: ctx.copy,
      timeline: ctx.timeline,
    });
  } catch (err) {
    console.error('[generate-scenes-v2] fatal:', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}

// --- Rendering strategy -----------------------------------------------------

async function renderScene(ctx, scene) {
  // 1) Freepik Reimagine Flux (image-to-image)
  try {
    const url = await freepikReimagine(ctx, scene);
    if (url) return { imageUrl: url, renderer: 'freepik-reimagine' };
  } catch (err) {
    console.warn(`[scene ${scene.id}] freepik failed:`, err?.message);
  }

  // 2) Photoroom scene replacement (background-only)
  try {
    const url = await photoroomSceneReplace(ctx, scene);
    if (url) return { imageUrl: url, renderer: 'photoroom' };
  } catch (err) {
    console.warn(`[scene ${scene.id}] photoroom failed:`, err?.message);
  }

  // 3) SVG placeholder (so the UI never breaks)
  return {
    imageUrl: svgPlaceholder(scene),
    renderer: 'svg-fallback',
  };
}

async function freepikReimagine(ctx, scene) {
  const key = process.env.FREEPIK_API_KEY;
  if (!key) return null;

  const res = await fetch(
    'https://api.freepik.com/v1/ai/image-to-image/flux-dev',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-freepik-api-key': key,
      },
      body: JSON.stringify({
        image: `data:${ctx.input.imageMime};base64,${ctx.input.imageBase64}`,
        prompt: scene.promptEn,
        negative_prompt: scene.negativePromptEn,
        guidance_scale: scene.guidanceScale,
        num_inference_steps: 28,
        aspect_ratio: scene.aspectRatio,
      }),
    }
  );
  if (!res.ok) throw new Error(`freepik ${res.status}`);
  const data = await res.json();
  return data?.data?.[0]?.base64
    ? `data:image/png;base64,${data.data[0].base64}`
    : data?.data?.[0]?.url || null;
}

async function photoroomSceneReplace(ctx, scene) {
  const key = process.env.PHOTOROOM_API_KEY;
  if (!key) return null;

  const form = new FormData();
  // Photoroom accepts the image file; in serverless we send base64 as Blob
  const blob = base64ToBlob(ctx.input.imageBase64, ctx.input.imageMime);
  form.append('imageFile', blob, 'product.jpg');
  form.append('background.prompt', scene.photoroomPromptEn);
  form.append('outputSize', aspectToSize(scene.aspectRatio));

  const res = await fetch('https://image-api.photoroom.com/v2/edit', {
    method: 'POST',
    headers: { 'x-api-key': key },
    body: form,
  });
  if (!res.ok) throw new Error(`photoroom ${res.status}`);
  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  return `data:image/png;base64,${b64}`;
}

function base64ToBlob(b64, mime) {
  const bin = Buffer.from(b64, 'base64');
  return new Blob([bin], { type: mime });
}

function aspectToSize(ar) {
  if (ar === '1:1') return '1200x1200';
  if (ar === '3:4') return '1200x1600';
  if (ar === '16:9') return '1920x1080';
  return '1200x1200';
}

function svgPlaceholder(scene) {
  const label = (scene.name || scene.id).replace(/[<>&]/g, '');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='1200'>
    <rect width='100%' height='100%' fill='#0A0A0A'/>
    <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
      fill='#E88923' font-family='Inter, sans-serif' font-size='42'>${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

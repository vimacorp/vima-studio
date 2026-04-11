// api/generate-carrossel.js
// Pipeline 100% dinamico, vision-first:
//   1. Chama /api/build-creative-brief com a foto + listing (Claude Sonnet 4 olha
//      a imagem e retorna 6 angulos criativos especificos pro produto).
//   2. Para cada angulo, gera a CENA via Flux Kontext Pro (text-to-image, sem
//      input_image, sem upload externo, sem renderizar texto na imagem).
//   3. Compoe copy_overlay (e cta_overlay no angulo 6) por cima usando Sharp+SVG.
//   4. Retorna 6 imagens como data URLs JPEG.
// ZERO hardcode de produto, copy ou nicho.

import sharp from 'sharp';

export const config = { maxDuration: 300 };

const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;
const FREEPIK_ENDPOINT = 'https://api.freepik.com/v1/ai/text-to-image/flux-kontext-pro';

const MARKETPLACE_ASPECT = {
  mercado_livre: 'square_1_1',
  amazon:        'square_1_1',
  shopee:        'square_1_1',
  magalu:        'square_1_1',
  shein:         'square_1_1',
  tiktok_shop:   'traditional_3_4',
  instagram:     'square_1_1',
  default:       'square_1_1'
};

// ---------- helpers ----------
function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxCharsPerLine) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur.length) { cur = w; continue; }
    if ((cur + ' ' + w).length <= maxCharsPerLine) cur = cur + ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- brief fetch (self-call) ----------
async function fetchBrief(req, imageBase64, listing, descricaoTecnica) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url = proto + '://' + host + '/api/build-creative-brief';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, listing, descricaoTecnica })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('build-creative-brief ' + r.status + ': ' + t.substring(0, 300));
  }
  const j = await r.json();
  if (!j || !j.brief || !Array.isArray(j.brief.angulos_criativos)) {
    throw new Error('brief invalid: missing angulos_criativos');
  }
  return j.brief;
}

// ---------- Flux Kontext Pro (text-to-image, sem input_image) ----------
async function generateImageFromPrompt(prompt, aspect) {
  const body = { prompt, aspect_ratio: aspect };
  const createResp = await fetch(FREEPIK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-freepik-api-key': FREEPIK_API_KEY
    },
    body: JSON.stringify(body)
  });
  if (!createResp.ok) {
    const err = await createResp.text();
    throw new Error('Freepik create ' + createResp.status + ': ' + err.substring(0, 300));
  }
  const created = await createResp.json();
  const taskId = created && created.data && created.data.task_id;
  if (!taskId) throw new Error('Freepik: missing task_id');

  const pollUrl = FREEPIK_ENDPOINT + '/' + taskId;
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 2500));
    const p = await fetch(pollUrl, { headers: { 'x-freepik-api-key': FREEPIK_API_KEY } });
    if (!p.ok) continue;
    const pj = await p.json();
    const status = pj && pj.data && pj.data.status;
    if (status === 'COMPLETED') {
      const generated = pj.data.generated || [];
      const url = generated[0] && (generated[0].url || generated[0]);
      const finalUrl = typeof url === 'string' ? url : (url && url.url);
      if (!finalUrl) throw new Error('Freepik: completed but no url');
      return finalUrl;
    }
    if (status === 'FAILED') throw new Error('Freepik: task failed');
  }
  throw new Error('Freepik: poll timeout');
}

async function downloadImageBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('download ' + r.status);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

// ---------- Sharp text overlay ----------
// Compoe overlay tipografico por cima da imagem gerada.
// - copy_overlay: barra superior (hook) ou inferior (demais).
// - cta_overlay (apenas angulo 6): botao amarelo arredondado abaixo do copy.
async function composeOverlay(imageBuffer, copy, cta, role) {
  const meta = await sharp(imageBuffer).metadata();
  const W = meta.width  || 1024;
  const H = meta.height || 1024;

  // Copy no topo apenas para o hook; nos demais, embaixo.
  const copyOnTop = role === 'hook_parar_scroll';

  const copyText = String(copy || '').toUpperCase().trim();
  const ctaText  = String(cta  || '').toUpperCase().trim();

  const lines = wrapText(copyText, 18);
  const lineCount = Math.max(1, lines.length);

  // Tipografia proporcional ao lado menor.
  const base = Math.min(W, H);
  const fontSize = Math.round(base * 0.072);
  const lineHeight = Math.round(fontSize * 1.18);
  const padX = Math.round(base * 0.05);
  const padY = Math.round(base * 0.035);

  const barHeight = lineCount * lineHeight + padY * 2;
  const barY = copyOnTop ? 0 : H - barHeight - (ctaText ? Math.round(base * 0.16) : 0);

  // SVG: barra preta semi-transparente + texto branco com leve stroke.
  const svgParts = [];
  svgParts.push('<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">');
  svgParts.push('<style>');
  svgParts.push('.copy { font-family: "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif; font-weight: 900; fill: #FFFFFF; stroke: #000000; stroke-width: 2px; paint-order: stroke; }');
  svgParts.push('.cta  { font-family: "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif; font-weight: 900; fill: #111111; }');
  svgParts.push('</style>');

  // Barra de fundo
  if (copyText) {
    svgParts.push('<rect x="0" y="' + barY + '" width="' + W + '" height="' + barHeight + '" fill="black" fill-opacity="0.62"/>');
    // Linhas de copy
    for (let i = 0; i < lines.length; i++) {
      const ty = barY + padY + (i + 1) * lineHeight - Math.round(lineHeight * 0.25);
      svgParts.push(
        '<text x="' + (W / 2) + '" y="' + ty + '" class="copy" font-size="' + fontSize + '" text-anchor="middle">' +
        escapeXml(lines[i]) +
        '</text>'
      );
    }
  }

  // CTA: botao amarelo arredondado
  if (ctaText) {
    const btnW = Math.round(W * 0.78);
    const btnH = Math.round(base * 0.12);
    const btnX = Math.round((W - btnW) / 2);
    const btnY = H - btnH - Math.round(base * 0.04);
    const ctaFont = Math.round(btnH * 0.46);
    const ctaY = btnY + Math.round(btnH * 0.66);
    svgParts.push('<rect x="' + btnX + '" y="' + btnY + '" width="' + btnW + '" height="' + btnH + '" rx="' + Math.round(btnH * 0.5) + '" ry="' + Math.round(btnH * 0.5) + '" fill="#FFD400" stroke="#000000" stroke-width="3"/>');
    svgParts.push(
      '<text x="' + (W / 2) + '" y="' + ctaY + '" class="cta" font-size="' + ctaFont + '" text-anchor="middle">' +
      escapeXml(ctaText) +
      '</text>'
    );
  }

  svgParts.push('</svg>');
  const svgBuffer = Buffer.from(svgParts.join(''));

  const out = await sharp(imageBuffer)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 86, progressive: true })
    .toBuffer();

  return 'data:image/jpeg;base64,' + out.toString('base64');
}

// ---------- pipeline por angulo ----------
async function renderAngulo(angulo, aspect) {
  const prompt = String(angulo.cena_visual || '').trim();
  if (!prompt) throw new Error('cena_visual vazia no angulo ' + angulo.ordem);
  const imgUrl = await generateImageFromPrompt(prompt, aspect);
  const buf = await downloadImageBuffer(imgUrl);
  const dataUrl = await composeOverlay(buf, angulo.copy_overlay, angulo.cta_overlay, angulo.papel_no_fluxo);
  return {
    idx: (angulo.ordem || 0) - 1,
    role: angulo.papel_no_fluxo,
    label: angulo.conceito || angulo.papel_no_fluxo,
    copy: angulo.copy_overlay || '',
    cta: angulo.cta_overlay || '',
    prompt: prompt,
    imageDataUrl: dataUrl
  };
}

// ---------- handler ----------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!FREEPIK_API_KEY) return res.status(500).json({ error: 'FREEPIK_API_KEY not configured' });

    const { imageBase64, listing, marketplace, descricaoTecnica } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
    if (!listing)     return res.status(400).json({ error: 'listing required' });

    const aspect = MARKETPLACE_ASPECT[marketplace] || MARKETPLACE_ASPECT.default;

    // 1. Brief dinamico (vision)
    const brief = await fetchBrief(req, imageBase64, listing, descricaoTecnica);

    // 2-3. Gera + compoe os 6 angulos em paralelo, tolerando falhas individuais
    const angulos = brief.angulos_criativos.slice(0, 6);
    const results = await Promise.allSettled(
      angulos.map(function (a) { return renderAngulo(a, aspect); })
    );

    const scenes = [];
    const errors = [];
    results.forEach(function (r, i) {
      if (r.status === 'fulfilled') scenes.push(r.value);
      else errors.push({
        idx: i,
        role: angulos[i] && angulos[i].papel_no_fluxo,
        error: String(r.reason && r.reason.message || r.reason).substring(0, 300)
      });
    });

    if (!scenes.length) {
      return res.status(502).json({ error: 'all_scenes_failed', errors: errors, brief: brief });
    }

    scenes.sort(function (a, b) { return a.idx - b.idx; });

    return res.status(200).json({
      scenes: scenes,
      total: scenes.length,
      failed: errors.length,
      errors: errors,
      brief: brief
    });
  } catch (e) {
    console.error('generate-carrossel error', e);
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}

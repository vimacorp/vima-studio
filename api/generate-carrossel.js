// api/generate-carrossel.js
// Gera carrossel de imagens de e-commerce baseado em neuromarketing,
// adaptado ao marketplace selecionado (dimensoes e estetica).

const FREEPIK_BASE = 'https://api.freepik.com/v1';
const FREEPIK_KEY = process.env.FREEPIK_API_KEY;

const MARKETPLACE_ASPECT = {
  mercadolivre: 'square_1_1',
  amazon: 'square_1_1',
  shopee: 'square_1_1',
  magalu: 'square_1_1',
  americanas: 'square_1_1',
  tiktok: 'social_story_9_16',
};

const MARKETPLACE_LABEL = {
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee',
  magalu: 'Magalu',
  americanas: 'Americanas',
  tiktok: 'TikTok Shop',
};
// Roadmap de persuasao neuromarketing - 7 cenas
function buildRoadmap(listing, marketplace) {
  const title = (listing && listing.title) || 'o produto';
  const category = (listing && listing.category) || 'Casa';
  const bullets = (listing && (listing.bullet_points || listing.attributes)) || {};
  const bulletText = Array.isArray(bullets)
    ? bullets.join('. ')
    : Object.values(bullets || {}).join('. ');
  const mkLabel = MARKETPLACE_LABEL[marketplace] || marketplace;
  const base = 'Professional e-commerce product photography. The reference product must appear exactly as in the input image (same color, shape, materials, proportions). Sharp focus, studio-quality lighting, clean composition, premium aesthetic, consistent brand visual identity. No text unless specified.';

  return [
    {
      role: 'hook',
      label: 'Gancho visual (capa principal)',
      prompt: base + ' Hero product shot: the product centered on a pristine white cyclorama background with a subtle soft shadow below. Ultra-clean, magazine-cover quality, aspirational. Perfect for marketplace cover image on ' + mkLabel + '. Product is ' + title + '. Category: ' + category + '.'
    },
    {
      role: 'in_use',
      label: 'Produto em uso / ambientacao',
      prompt: base + ' Lifestyle shot: the product being used in a real, cozy Brazilian home environment that matches its purpose. Natural daylight through a window, styled but not staged. Show the product fulfilling its job for a real family. Product is ' + title + '.'
    },
    {
      role: 'benefit_1',
      label: 'Beneficio principal',
      prompt: base + ' Close-up showing the product main benefit: ' + (bulletText.slice(0, 200) || 'organizacao, praticidade e beleza') + '. Crisp macro focus on the feature that matters most. Warm, inviting atmosphere.'
    },
    {
      role: 'benefit_2',
      label: 'Beneficio secundario / diferencial',
      prompt: base + ' Three-quarter angle showing a distinctive detail or finish of the product. Highlight build quality, material texture, craftsmanship. Cinematic lighting that sells the premium feel. Product: ' + title + '.'
    },
    {
      role: 'social_proof',
      label: 'Prova social / uso cotidiano',
      prompt: base + ' A pair of hands (no face) using the product naturally, as a happy owner would. Conveys "real people love this". Soft natural light, warm color palette, slight depth of field. Product: ' + title + '.'
    },
    {
      role: 'details',
      label: 'Detalhes / textura',
      prompt: base + ' Flat lay or top-down clean shot of the product with texture detail and subtle scale hints. Neutral light grey background. The feeling is "everything you need to know at a glance". Product: ' + title + '.'
    },
    {
      role: 'cta',
      label: 'Chamada final',
      prompt: base + ' Bold closing frame: the product gorgeously lit against a soft gradient background that complements the ' + mkLabel + ' brand palette. Aspirational, confident, this-is-the-one feeling. Leave negative space on the right for potential CTA text. Product: ' + title + '.'
    }
  ];
}

async function uploadToTmpfiles(base64, mime) {
  try {
    const clean = String(base64 || '').replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime || 'image/jpeg' }), 'product.jpg');
    const r = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: form });
    const json = await r.json();
    const url = json && json.data && json.data.url;
    if (!url) return null;
    return url.replace(/^https?:\/\/tmpfiles\.org\//, 'https://tmpfiles.org/dl/');
  } catch (e) {
    console.error('[carrossel] upload failed:', e && e.message);
    return null;
  }
}

async function callFreepik(prompt, inputImageUrl, aspect) {
  const body = { prompt, input_image: inputImageUrl, aspect_ratio: aspect };
  const r = await fetch(FREEPIK_BASE + '/ai/text-to-image/flux-kontext-pro', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-freepik-api-key': FREEPIK_KEY
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text().catch(function(){return '';});
    throw new Error('freepik_start_failed ' + r.status + ' ' + txt.slice(0, 200));
  }
  const json = await r.json();
  const taskId = json && json.data && json.data.task_id;
  if (!taskId) throw new Error('no_task_id');
  for (let i = 0; i < 30; i++) {
    await new Promise(function(res){ setTimeout(res, 2500); });
    const pr = await fetch(FREEPIK_BASE + '/ai/text-to-image/flux-kontext-pro/' + taskId, {
      headers: { 'x-freepik-api-key': FREEPIK_KEY }
    });
    if (!pr.ok) continue;
    const pj = await pr.json();
    const data = pj && pj.data;
    if (!data) continue;
    if (data.status === 'COMPLETED') {
      const url = (data.generated && data.generated[0]) || (data.images && data.images[0] && data.images[0].url) || data.image_url || data.url;
      if (url) return url;
    }
    if (data.status === 'FAILED') throw new Error('freepik_task_failed');
  }
  throw new Error('freepik_timeout');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'method_not_allowed' });
  }
  try {
    const { imageBase64, listing, marketplace = 'mercadolivre' } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'imageBase64_required' });
    }
    if (!FREEPIK_KEY) {
      return res.status(500).json({ success: false, error: 'FREEPIK_API_KEY_not_configured' });
    }
    const inputUrl = await uploadToTmpfiles(imageBase64, 'image/jpeg');
    if (!inputUrl) {
      return res.status(500).json({ success: false, error: 'input_upload_failed' });
    }
    const roadmap = buildRoadmap(listing || {}, marketplace);
    const aspect = MARKETPLACE_ASPECT[marketplace] || 'square_1_1';

    const results = await Promise.all(
      roadmap.map(async function(scene) {
        try {
          const imageUrl = await callFreepik(scene.prompt, inputUrl, aspect);
          return {
            role: scene.role,
            label: scene.label,
            imageUrl: imageUrl,
            prompt: scene.prompt,
            status: 'ok'
          };
        } catch (e) {
          console.error('[carrossel] scene ' + scene.role + ' failed:', e && e.message);
          return {
            role: scene.role,
            label: scene.label,
            imageUrl: null,
            prompt: scene.prompt,
            status: 'failed',
            error: (e && e.message) || 'unknown'
          };
        }
      })
    );

    const okCount = results.filter(function(r){ return r.status === 'ok'; }).length;
    return res.status(200).json({
      success: true,
      marketplace: marketplace,
      aspect: aspect,
      scenes: results,
      summary: { total: results.length, ok: okCount, failed: results.length - okCount }
    });
  } catch (err) {
    console.error('[carrossel] fatal:', err);
    return res.status(500).json({ success: false, error: (err && err.message) || 'internal_error' });
  }
}

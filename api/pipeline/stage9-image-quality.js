// api/pipeline/stage9-image-quality.js
// VIMA STUDIO — Stage 9: Image Quality Critic (Wave 2)
//
// Given an array of rendered scenes, asks Claude Sonnet 4 (vision) to score
// each one against objective ad-photography criteria and return pass/fail plus
// suggested prompt adjustments for failures.
//
// Contract:
//   input  : ctx.renderedScenes (array from Stage 8)
//   output : ctx.qualityReport = {
//              overallScore: 0..10,
//              results: [{
//                sceneId, pass, score, issues:[], fixes:{ promptEn?, negativePromptEn? }
//              }]
//            }
//
// NOTE: Images that are SVG fallbacks are automatically marked as "fail"
// without calling the model (we know they're placeholders).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `Você é um Diretor de Arte sênior revisando anúncios gerados por IA para marketplaces brasileiros (Mercado Livre, Amazon, Shopee).

Sua função é avaliar cada imagem renderizada contra critérios OBJETIVOS de qualidade publicitária e retornar APENAS JSON válido.

Critérios de avaliação (cada um 0-2 pontos, total 0-10):
1. PRODUTO VISÍVEL (0-2): O produto está claramente visível, centrado, sem corte indevido, sem distorção?
2. COMPOSIÇÃO (0-2): A composição respeita regra dos terços, tem hierarquia visual clara, espaço para respiro?
3. ILUMINAÇÃO (0-2): A iluminação é consistente, sem estouros, sem sombras duras desagradáveis?
4. COERÊNCIA COM O PRODUTO (0-2): O cenário/ambiente faz sentido para este produto específico?
5. QUALIDADE TÉCNICA (0-2): Sem artefatos de IA (mãos deformadas, texto ilegível, objetos fundidos), nitidez adequada?

Regra de aprovação: pass = score >= 7 E todos os critérios >= 1.

Para cada imagem reprovada, sugira ajustes CONCRETOS no prompt (promptEn) e/ou negative prompt (negativePromptEn) que mitigariam os problemas encontrados. Seja específico — "add soft rim light from left" é melhor que "improve lighting".

Retorne EXCLUSIVAMENTE o JSON abaixo, sem markdown, sem comentários:

{
  "overallScore": 7.2,
  "results": [
    {
      "sceneId": "catalog-white",
      "pass": true,
      "score": 9,
      "scores": { "produto": 2, "composicao": 2, "iluminacao": 2, "coerencia": 2, "tecnica": 1 },
      "issues": [],
      "fixes": {}
    },
    {
      "sceneId": "lifestyle-kitchen",
      "pass": false,
      "score": 5,
      "scores": { "produto": 1, "composicao": 1, "iluminacao": 1, "coerencia": 2, "tecnica": 0 },
      "issues": ["product partially cropped on right edge", "blurry foreground artifact"],
      "fixes": {
        "promptEn": "center the product with generous margin, sharp focus throughout, no foreground blur",
        "negativePromptEn": "cropped, blurry, foreground artifacts, partial product"
      }
    }
  ]
}`;

export async function runImageQualityCritic(ctx) {
  const scenes = ctx.renderedScenes || [];
  if (scenes.length === 0) {
    ctx.qualityReport = { overallScore: 0, results: [] };
    return ctx.qualityReport;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Without the key we cannot critique — mark everything as pass so the
    // pipeline still completes. Wave 2 will be a no-op in that case.
    ctx.qualityReport = {
      overallScore: null,
      results: scenes.map((s) => ({
        sceneId: s.id,
        pass: s.renderer !== 'svg-fallback',
        score: s.renderer === 'svg-fallback' ? 0 : null,
        issues: s.renderer === 'svg-fallback' ? ['svg placeholder used'] : [],
        fixes: {},
      })),
      skipped: 'no ANTHROPIC_API_KEY',
    };
    return ctx.qualityReport;
  }

  // Auto-fail SVG fallbacks — no sense sending them to the model
  const fallbacks = scenes
    .filter((s) => s.renderer === 'svg-fallback')
    .map((s) => ({
      sceneId: s.id,
      pass: false,
      score: 0,
      scores: { produto: 0, composicao: 0, iluminacao: 0, coerencia: 0, tecnica: 0 },
      issues: ['svg placeholder — no real render produced'],
      fixes: {},
    }));

  const toCritique = scenes.filter(
    (s) => s.renderer !== 'svg-fallback' && s.imageUrl
  );

  if (toCritique.length === 0) {
    ctx.qualityReport = {
      overallScore: 0,
      results: fallbacks,
    };
    return ctx.qualityReport;
  }

  // Build multimodal content: one text block + N image blocks
  const content = [
    {
      type: 'text',
      text:
        'Avalie as imagens abaixo (na ordem listada). Os ids correspondentes são:\n' +
        toCritique.map((s, i) => `${i + 1}. ${s.id} — ${s.name} (${s.aspectRatio})`).join('\n') +
        '\n\nRetorne o JSON conforme instruído.',
    },
  ];

  for (const s of toCritique) {
    content.push(imageBlockFromUrl(s.imageUrl));
  }

  const body = {
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`image-quality critic ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const txt = data?.content?.[0]?.text || '';
  const parsed = safeParseJson(txt) || { overallScore: null, results: [] };

  // Merge fallbacks with critiqued
  const merged = [...fallbacks, ...(parsed.results || [])];
  const nums = merged.map((r) => r.score).filter((n) => typeof n === 'number');
  const overall =
    nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0;

  ctx.qualityReport = {
    overallScore: overall,
    results: merged,
  };
  return ctx.qualityReport;
}

function imageBlockFromUrl(url) {
  // data: URL → base64 source; http(s) URL → url source
  if (typeof url === 'string' && url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      return {
        type: 'image',
        source: { type: 'base64', media_type: m[1], data: m[2] },
      };
    }
  }
  return {
    type: 'image',
    source: { type: 'url', url },
  };
}

function safeParseJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {}
  // Strip ```json fences if present
  const m = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch {}
  }
  // Grab the first {...} block
  const brace = txt.indexOf('{');
  const last = txt.lastIndexOf('}');
  if (brace >= 0 && last > brace) {
    try {
      return JSON.parse(txt.slice(brace, last + 1));
    } catch {}
  }
  return null;
}

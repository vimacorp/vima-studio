// api/pipeline/stage7-creative-director.js
// VIMA STUDIO — Stage 7: Creative Director
//
// Purpose:
//   Replaces the old hardcoded SCENES array from api/generate-scenes.js.
//   Reads the Visual Analysis from Stage 1 and produces a CUSTOM scene plan
//   that is coherent with the actual product. A kitchen organizer will never
//   again be rendered in an outdoor garden.
//
// Input:   ctx.visualAnalysis (required)
// Output:  ctx.scenePlan (object, see schema)
//
// Model:   Claude Sonnet 4 (claude-sonnet-4-20250514) — text only
// Env:     ANTHROPIC_API_KEY

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `Você é um Diretor Criativo especialista em fotografia publicitária de produto. Você recebe uma análise técnica/visual de um produto e desenha um conjunto de cenas que serão renderizadas por uma IA image-to-image (Freepik Reimagine Flux / Mystic). Cada cena precisa ser COERENTE com o produto real — nunca coloque o produto em contextos impossíveis ou que contradigam o uso real.

Princípios:
1. Coerência contextual acima de tudo. Produto de cozinha fica na cozinha. Produto de jardim no jardim. Produto tech em ambiente clean/tech.
2. Variedade útil: as cenas devem ser DIFERENTES entre si (ângulo, cenário, iluminação, emoção), não apenas o mesmo cenário em ângulos parecidos.
3. Respeite "avoidInGeneration" e "uniqueSellingPoints" da análise.
4. Prompts em inglês (Freepik performa melhor em inglês), mas retorne em JSON em português/estruturado.
5. Inclua sempre pelo menos UMA cena com "pure white background" para a foto de catálogo obrigatória de ML/Amazon.

Responda SEMPRE em JSON válido. Nada fora do JSON.`;

/**
 * @param {PipelineContext} ctx
 * @param {{ sceneCount?: number, package?: 'MINI'|'LITE'|'PRO' }} [opts]
 */
export async function runCreativeDirector(ctx, opts = {}) {
  if (!ctx.visualAnalysis) {
    throw new Error('CreativeDirector requires ctx.visualAnalysis (run Stage 1 first)');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const pkg = opts.package || 'LITE';
  const sceneCount =
    opts.sceneCount ||
    (pkg === 'MINI' ? 6 : pkg === 'LITE' ? 10 : 16);

  const userPrompt = buildUserPrompt(ctx.visualAnalysis, sceneCount, pkg);

  const body = {
    model: MODEL,
    max_tokens: 4000,
    temperature: 0.7,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CreativeDirector API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const raw = data?.content?.[0]?.text || '';
  const parsed = safeParseJson(raw);
  if (!parsed || !Array.isArray(parsed.scenes)) {
    throw new Error('CreativeDirector returned invalid plan: ' + raw.slice(0, 500));
  }

  const plan = {
    package: pkg,
    totalScenes: parsed.scenes.length,
    rationale: String(parsed.rationale || ''),
    scenes: parsed.scenes.map((s, i) => normalizeScene(s, i)),
  };
  ctx.scenePlan = plan;
  return plan;
}

function buildUserPrompt(va, sceneCount, pkg) {
  return `Análise visual do produto:
${JSON.stringify(va, null, 2)}

Tarefa: monte um scene plan com EXATAMENTE ${sceneCount} cenas para o pacote ${pkg}.

Distribuição obrigatória:
- 1 cena "catalog": fundo branco puro (#FFFFFF), produto centralizado, iluminação de estúdio, sombra sutil. Esta é a foto de capa obrigatória do marketplace.
- ~40% das cenas com aspect ratio "1:1" (marketplace feed)
- ~45% das cenas com aspect ratio "3:4" (vertical mobile/stories)
- ~15% das cenas com aspect ratio "16:9" (opcional, header/banner)

Cada cena no JSON deve ter:
{
  "id": "scene-01",
  "name": "nome descritivo curto em pt-BR",
  "purpose": "catalog | lifestyle | detail | mood | context",
  "aspectRatio": "1:1" | "3:4" | "16:9",
  "environment": "descrição curta do ambiente em pt-BR",
  "lighting": "descrição curta da iluminação em pt-BR",
  "mood": "palavra única em pt-BR (ex: 'acolhedor', 'tecnológico', 'elegante')",
  "cameraAngle": "frontal | tres-quartos | topo | baixo | flat-lay",
  "promptEn": "prompt completo EM INGLÊS para Freepik Reimagine Flux — descreva o cenário, NÃO o produto (o produto vem da imagem de referência). Inclua: cenário, superfície, luz, atmosfera, detalhes secundários coerentes, estilo fotográfico. Máximo 80 palavras.",
  "negativePromptEn": "prompt negativo em inglês: coisas a EVITAR (texto, watermark, deformação, cores erradas, etc.)",
  "photoroomPromptEn": "prompt alternativo EM INGLÊS para Photoroom scene replacement — mais conciso, foca só no cenário. Máximo 40 palavras.",
  "guidanceScale": número entre 0.3 e 0.8 — quanto respeitar a imagem de referência (0.7 = muito fiel ao produto original)
}

Formato final do JSON (responda SÓ isso):
{
  "rationale": "1-2 frases explicando a estratégia geral do scene plan para este produto específico",
  "scenes": [ ... ${sceneCount} cenas ... ]
}`;
}

function safeParseJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function normalizeScene(s, i) {
  return {
    id: String(s.id || `scene-${String(i + 1).padStart(2, '0')}`),
    name: String(s.name || `Cena ${i + 1}`),
    purpose: String(s.purpose || 'lifestyle'),
    aspectRatio: ['1:1', '3:4', '16:9'].includes(s.aspectRatio) ? s.aspectRatio : '1:1',
    environment: String(s.environment || ''),
    lighting: String(s.lighting || ''),
    mood: String(s.mood || ''),
    cameraAngle: String(s.cameraAngle || 'frontal'),
    promptEn: String(s.promptEn || ''),
    negativePromptEn: String(
      s.negativePromptEn ||
        'text, watermark, logo, distortion, blurry, low quality, extra objects, wrong colors'
    ),
    photoroomPromptEn: String(s.photoroomPromptEn || s.promptEn || ''),
    guidanceScale:
      typeof s.guidanceScale === 'number' ? clamp(s.guidanceScale, 0.3, 0.9) : 0.7,
  };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

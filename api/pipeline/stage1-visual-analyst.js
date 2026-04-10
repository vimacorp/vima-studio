// api/pipeline/stage1-visual-analyst.js
// VIMA STUDIO — Stage 1: Visual Analyst
//
// Purpose:
//   Before any copy or scene is generated, look HARD at the product photo
//   and produce a structured, opinionated description that every downstream
//   stage will rely on. This is the single biggest quality lever — it is
//   what makes Prismatica feel "coherent" and what VIMA currently lacks.
//
// Input:   ctx.input.imageBase64, ctx.input.imageMime, ctx.input.productName
// Output:  ctx.visualAnalysis (object, see schema below)
//
// Model:   Claude Sonnet 4 (claude-sonnet-4-20250514) with vision
// Env:     ANTHROPIC_API_KEY

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `Você é um Diretor de Arte especialista em fotografia de produto para marketplaces brasileiros (Mercado Livre, Shopee, Amazon). Sua missão é olhar UMA foto de produto e devolver uma descrição técnica, detalhada e acionável que servirá de base para gerar TODAS as imagens e vídeos do anúncio.

Você NUNCA inventa atributos que não estão visíveis. Se não tem certeza, marca como "unknown".

Responda SEMPRE em JSON válido seguindo rigorosamente o schema pedido pelo usuário. Nada fora do JSON. Sem markdown. Sem comentários.`;

const USER_INSTRUCTION = `Analise a foto do produto abaixo e devolva um JSON com EXATAMENTE os campos:

{
  "category": "string — categoria específica do produto (ex: 'Organizador de cozinha', 'Vaso decorativo', 'Fone de ouvido bluetooth')",
  "subCategory": "string — nicho mais fino (ex: 'Porta-temperos giratório', 'Vaso de concreto minimalista')",
  "productType": "string — o que É o objeto em 2-4 palavras",
  "primaryMaterial": "string — material principal visível (plástico, metal, cerâmica, madeira, tecido, vidro, ...)",
  "secondaryMaterials": ["array de outros materiais visíveis"],
  "dominantColors": ["array de 1 a 3 cores hex ex '#1A1A1A', na ordem de dominância"],
  "finish": "string — acabamento: fosco, brilhante, acetinado, texturizado, metalizado, transparente, ...",
  "shape": "string — geometria: cilíndrico, retangular, orgânico, vazado, assimétrico, ...",
  "sizeEstimate": "string — tamanho estimado: miniatura (<10cm), pequeno (10-25cm), médio (25-60cm), grande (>60cm)",
  "style": "string — estilo visual: minimalista, rústico, industrial, clássico, futurista, pop, ...",
  "targetAudience": "string — para quem esse produto obviamente foi feito",
  "useContext": ["array de 2-4 ambientes/situações onde o produto é usado, ex 'cozinha moderna', 'escritório home-office'"],
  "valuePropositions": ["array de 2-5 benefícios visuais do produto — só o que dá pra inferir da foto"],
  "photoQualityIssues": ["array de problemas técnicos da foto atual: 'fundo poluído', 'iluminação amarelada', 'sombra dura', 'foco suave', 'ângulo ruim', 'reflexo', 'baixa resolução aparente'"],
  "backgroundType": "string — como é o fundo atual: 'branco puro', 'cinza neutro', 'cenário residencial', 'superfície de mesa', 'fundo texturizado', 'outro'",
  "lightingDirection": "string — 'frontal', 'lateral', 'contraluz', 'difusa ampla', 'indeterminada'",
  "cameraAngle": "string — 'frontal', 'topo', 'tres-quartos', 'baixo para cima', 'flat lay'",
  "uniqueSellingPoints": ["array de 1-3 coisas visualmente distintas desse produto específico que devem aparecer destacadas nas imagens geradas"],
  "avoidInGeneration": ["array de coisas a EVITAR nas gerações futuras, ex 'não adicionar texto', 'não mudar a cor', 'não deformar as proporções'"],
  "confidence": "number entre 0 e 1 — sua confiança geral na análise"
}

Responda SOMENTE o JSON.`;

export async function runVisualAnalyst(ctx) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const body = {
    model: MODEL,
    max_tokens: 2000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: ctx.input.imageMime || 'image/jpeg',
              data: ctx.input.imageBase64,
            },
          },
          {
            type: 'text',
            text:
              (ctx.input.productName
                ? `Nome informado pelo vendedor: "${ctx.input.productName}".\n`
                : '') +
              (ctx.input.productDescription
                ? `Descrição informada: "${ctx.input.productDescription}".\n\n`
                : '\n') +
              USER_INSTRUCTION,
          },
        ],
      },
    ],
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
    throw new Error(`VisualAnalyst Claude API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const raw = data?.content?.[0]?.text || '';
  const parsed = safeParseJson(raw);
  if (!parsed) {
    throw new Error('VisualAnalyst returned non-JSON: ' + raw.slice(0, 500));
  }

  const analysis = normalize(parsed);
  ctx.visualAnalysis = analysis;
  return analysis;
}

function safeParseJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    // try to extract the first {...} block
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function normalize(p) {
  const asArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  return {
    category: String(p.category || 'unknown'),
    subCategory: String(p.subCategory || ''),
    productType: String(p.productType || 'unknown'),
    primaryMaterial: String(p.primaryMaterial || 'unknown'),
    secondaryMaterials: asArr(p.secondaryMaterials),
    dominantColors: asArr(p.dominantColors),
    finish: String(p.finish || 'unknown'),
    shape: String(p.shape || 'unknown'),
    sizeEstimate: String(p.sizeEstimate || 'unknown'),
    style: String(p.style || 'unknown'),
    targetAudience: String(p.targetAudience || 'unknown'),
    useContext: asArr(p.useContext),
    valuePropositions: asArr(p.valuePropositions),
    photoQualityIssues: asArr(p.photoQualityIssues),
    backgroundType: String(p.backgroundType || 'unknown'),
    lightingDirection: String(p.lightingDirection || 'unknown'),
    cameraAngle: String(p.cameraAngle || 'unknown'),
    uniqueSellingPoints: asArr(p.uniqueSellingPoints),
    avoidInGeneration: asArr(p.avoidInGeneration),
    confidence: typeof p.confidence === 'number' ? p.confidence : 0.5,
  };
}

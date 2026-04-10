// api/pipeline/stage10-brand-voice.js
// VIMA STUDIO — Stage 10: Brand Voice Agent (Wave 3)
//
// Produz o copy completo pro anúncio: título otimizado, bullets, descrição
// longa e keywords. Usa Claude Sonnet 4 em modo texto (sem vision — a imagem
// já foi analisada na Stage 1 e está disponível como ctx.visualAnalysis).
//
// Input esperado em ctx:
//   - ctx.visualAnalysis  (da Stage 1)
//   - ctx.scenePlan       (da Stage 7)   — opcional, ajuda no tom
//   - ctx.input.marketplace ('mercadolivre' | 'amazon' | 'shopee')
//   - ctx.input.productName / productDescription (se o user informou)
//
// Output (ctx.copy):
//   {
//     marketplace,
//     title,            // string — respeita limite do marketplace
//     bullets: [string] // 5 bullets curtos
//     description,      // texto longo (HTML leve permitido)
//     keywords: [string],
//     tone: string      // tom detectado ('premium' | 'casual' | ...)
//   }
//
// Graceful degradation: se não tiver ANTHROPIC_API_KEY, devolve copy básico
// montado a partir de ctx.visualAnalysis sem chamar o modelo.

const MODEL = 'claude-sonnet-4-20250514';

const MARKETPLACE_RULES = {
  mercadolivre: {
    titleMaxChars: 60,
    guidelines:
      'Mercado Livre BR: título com marca + modelo + atributos-chave, sem caixa alta abusiva, sem emojis, sem promessas exageradas. Priorize palavras que o comprador busca.',
  },
  amazon: {
    titleMaxChars: 200,
    guidelines:
      'Amazon BR: título descritivo e rico, "Marca + Linha + Tipo + Característica 1 + Característica 2 + Tamanho/Cor". Sem promoções no título.',
  },
  shopee: {
    titleMaxChars: 100,
    guidelines:
      'Shopee BR: título com principais palavras-chave primeiro, tom mais casual permitido, pode usar emojis com moderação (no máx. 1-2 no início). Foque em benefícios.',
  },
};

const SYSTEM_PROMPT = `Você é o Brand Voice Agent da VIMA STUDIO. Sua função é escrever copy de anúncio de alta conversão para marketplaces brasileiros.

Regras universais:
- Português do Brasil, sem erros.
- Zero claims falsos. Zero superlativos vazios ("o melhor do mundo").
- Use as informações visuais fornecidas — não invente atributos que o produto não tem.
- Tom profissional mas humano. Fale com quem compra, não com quem vende.
- Bullets: 1 linha cada, começando com benefício (não feature), sem ponto final.
- Description: 3-5 parágrafos curtos, cada um com um ângulo diferente (uso, qualidade, garantia, quem é o comprador ideal).
- Keywords: 10-15 termos que o comprador usaria numa busca, do mais genérico ao mais específico.

Devolva EXCLUSIVAMENTE JSON válido no seguinte schema:
{
  "title": string,
  "bullets": [string, string, string, string, string],
  "description": string,
  "keywords": [string],
  "tone": "premium" | "casual" | "técnico" | "aspiracional" | "funcional"
}`;

export async function runBrandVoiceAgent(ctx) {
  const marketplace = ctx.input?.marketplace || 'mercadolivre';
  const rules = MARKETPLACE_RULES[marketplace] || MARKETPLACE_RULES.mercadolivre;
  const va = ctx.visualAnalysis || {};

  // Fallback sem modelo
  if (!process.env.ANTHROPIC_API_KEY) {
    ctx.copy = fallbackCopy(ctx, marketplace, rules);
    return { ok: true, skipped: true, reason: 'no-anthropic-key' };
  }

  const userPrompt = buildUserPrompt(ctx, marketplace, rules, va);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`brand-voice anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text || '';
  const parsed = safeParseJson(text);

  if (!parsed) {
    // Modelo devolveu algo que não é JSON — usar fallback pra não quebrar o pipeline
    ctx.copy = fallbackCopy(ctx, marketplace, rules);
    return { ok: true, skipped: true, reason: 'parse-failed', raw: text.slice(0, 200) };
  }

  // Clamp título ao limite do marketplace
  const clampedTitle = (parsed.title || '').slice(0, rules.titleMaxChars);

  ctx.copy = {
    marketplace,
    title: clampedTitle,
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 5) : [],
    description: String(parsed.description || ''),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 15) : [],
    tone: parsed.tone || 'funcional',
  };

  return { ok: true };
}

function buildUserPrompt(ctx, marketplace, rules, va) {
  const lines = [];
  lines.push(`Marketplace alvo: ${marketplace.toUpperCase()}`);
  lines.push(`Limite do título: ${rules.titleMaxChars} caracteres.`);
  lines.push(`Diretrizes do marketplace: ${rules.guidelines}`);
  lines.push('');
  lines.push('Informações que o vendedor forneceu:');
  lines.push(`- Nome: ${ctx.input?.productName || '(não informado)'}`);
  lines.push(`- Descrição: ${ctx.input?.productDescription || '(não informada)'}`);
  lines.push('');
  lines.push('Análise visual do produto (Stage 1):');
  lines.push(JSON.stringify(va, null, 2));
  if (ctx.scenePlan?.concept) {
    lines.push('');
    lines.push(`Conceito criativo (Stage 7): ${ctx.scenePlan.concept}`);
  }
  lines.push('');
  lines.push(
    'Escreva o copy completo no schema JSON especificado. Nada de texto fora do JSON.'
  );
  return lines.join('\n');
}

function fallbackCopy(ctx, marketplace, rules) {
  const va = ctx.visualAnalysis || {};
  const name = ctx.input?.productName || va.productType || 'Produto';
  const material = va.material || '';
  const color = va.primaryColor || '';
  const rawTitle = [name, material, color].filter(Boolean).join(' ');
  return {
    marketplace,
    title: rawTitle.slice(0, rules.titleMaxChars),
    bullets: [
      `${name} com acabamento ${material || 'de qualidade'}`,
      `Cor ${color || 'exclusiva'} combina com qualquer ambiente`,
      'Pronto pra entrega imediata',
      'Garantia e suporte VIMA',
      'Nota fiscal incluída',
    ].filter(Boolean),
    description:
      ctx.input?.productDescription ||
      `${name} ideal pra quem busca qualidade e bom preço. Confira as fotos e garanta o seu.`,
    keywords: [name, material, color, marketplace].filter(Boolean),
    tone: 'funcional',
  };
}

function safeParseJson(txt) {
  if (!txt) return null;
  const cleaned = txt
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const brace = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (brace >= 0 && last > brace) {
    try {
      return JSON.parse(cleaned.slice(brace, last + 1));
    } catch {}
  }
  return null;
}

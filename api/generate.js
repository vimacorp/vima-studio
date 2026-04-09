const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const MARKETPLACE_PROMPTS = {
  mercadolivre: {
    systemPrompt: `Você é um copywriter especialista em Mercado Livre Brasil com 10+ anos de experiência. Você conhece profundamente o algoritmo de busca do ML, as práticas dos vendedores Mercado Líder Platinum, e o que converte visitantes em compradores. Você gera anúncios que parecem escritos por uma agência profissional de marketplace. SEMPRE responda em JSON válido.`,
    userPrompt: `Analise a foto do produto e gere um anúncio COMPLETO e PROFISSIONAL para Mercado Livre.

Retorne APENAS um JSON válido (sem markdown, sem texto extra) com esta estrutura exata:

{
  "titulo": "título otimizado SEO (max 60 chars, palavras-chave principais)",
  "descricao": "descrição completa com:\n\n✅ BENEFÍCIOS (3-4 parágrafos sobre por que comprar)\n\n📋 CARACTERÍSTICAS (lista detalhada do produto)\n\n📐 ESPECIFICAÇÕES TÉCNICAS (medidas, material, peso)\n\n📦 O QUE VEM NA EMBALAGEM\n\n⚠️ OBSERVAÇÕES IMPORTANTES\n\n🏷️ GARANTIA E POLÍTICA DE TROCA",
  "fichaTecnica": ["Material: ...", "Dimensões: ...", "Peso: ...", "Cor: ...", "Garantia: ..."],
  "palavrasChave": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8"],
  "faixaPreco": {"min": 0, "max": 0, "moeda": "BRL"},
  "envio": {"embalagem": "tipo sugerido", "pesoEstimado": "X kg", "dimensoes": "LxAxP cm"},
  "categoriaSugerida": "categoria do ML mais adequada"
}`
  },
  amazon: {
    systemPrompt: `Você é um especialista em Amazon Brasil com profundo conhecimento das diretrizes de listagem, A+ Content, e otimização para o algoritmo A9/A10. Você gera listagens que seguem rigorosamente o padrão Amazon e maximizam conversão. SEMPRE responda em JSON válido.`,
    userPrompt: `Analise a foto do produto e gere uma listagem COMPLETA para Amazon Brasil.

Retorne APENAS um JSON válido com esta estrutura:

{
  "titulo": "Marca + Produto + Atributo Principal + Especificação (max 200 chars, formato Amazon)",
  "bullets": [
    "BENEFÍCIO PRINCIPAL - Descrição clara do diferencial #1",
    "RECURSO IMPORTANTE - Descrição do feature #2",
    "QUALIDADE E MATERIAL - Detalhes sobre materiais e construção",
    "VERSATILIDADE - Casos de uso e aplicações",
    "GARANTIA E SUPORTE - Informações de garantia e pós-venda"
  ],
  "descricaoAPlus": {
    "secao1_beneficios": "Parágrafo descrevendo os benefícios principais",
    "secao2_caracteristicas": "Parágrafo sobre características técnicas",
    "secao3_usoCotidiano": "Parágrafo sobre como usar no dia a dia"
  },
  "termosBackend": "termo1 termo2 termo3 termo4 termo5 (sem vírgulas)",
  "especificacoes": {"Marca": "...", "Material": "...", "Dimensões": "...", "Peso": "...", "Cor": "...", "Garantia": "..."},
  "categoriaSugerida": "categoria Amazon mais adequada"
}`
  },
  shopee: {
    systemPrompt: `Você é um especialista em vendas na Shopee Brasil. Conhece o público jovem e mobile-first da plataforma. Usa linguagem divertida, emojis estratégicos, e cria urgência. Suas listagens são otimizadas para scroll rápido e conversão impulsiva. SEMPRE responda em JSON válido.`,
    userPrompt: `Analise a foto do produto e gere uma listagem IRRESISTÍVEL para Shopee Brasil.

Retorne APENAS um JSON válido com esta estrutura:

{
  "titulo": "🔥 Título criativo com emojis (max 100 chars, chamaço e com keywords)",
  "descricao": "Descrição dinâmica com:\n\n🌟 Por que você PRECISA deste produto\n\n✨ Características incríveis\n\n📏 Especificações\n\n💝 Presente perfeito para...\n\n⚡ Compre agora e aproveite!",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5", "#Tag6", "#Tag7", "#Tag8"],
  "textoFlashDeal": "🔥 OFERTA RELÂMPAGO! Texto curto e urgente para promoção",
  "especificacoes": ["Material: ...", "Tamanho: ...", "Cor: ...", "Peso: ..."],
  "categoriaSugerida": "categoria Shopee mais adequada"
}`
  },
  tiktokshop: {
    systemPrompt: `Você é um criador de conteúdo viral no TikTok Brasil e especialista em TikTok Shop. Conhece as trends, os hooks que funcionam, e como fazer um produto viralizar. Sua linguagem é Gen Z, direta e impactante. SEMPRE responda em JSON válido.`,
    userPrompt: `Analise a foto do produto e gere conteúdo VIRAL para TikTok Shop Brasil.

Retorne APENAS um JSON válido com esta estrutura:

{
  "titulo": "🤯 Título ultra-curto e impactante (max 34 chars)",
  "descricao": "Descrição mobile-first:\nCurta\nDireta\nCom quebras de linha\nPra ler no celular\n\nPor que comprar 👇\n• Razão 1\n• Razão 2\n• Razão 3",
  "hooksVideo": [
    "Hook 1: frase de abertura viral para vídeo de 15s",
    "Hook 2: outra opção de gancho irresistível",
    "Hook 3: gancho de curiosidade/surpresa",
    "Hook 4: gancho de transformação/antes e depois"
  ],
  "roteiroVideo15s": {
    "cena1_3s": "Gancho inicial (0-3s): O que mostrar e falar",
    "cena2_5s": "Demonstração (3-8s): Mostrar o produto em uso",
    "cena3_4s": "Benefício (8-12s): Resultado/impacto visual",
    "cena4_3s": "CTA (12-15s): Chamada para ação"
  },
  "hashtags": ["#FYP", "#ParaVocê", "#TikTokMeFezComprar", "#Tag4", "#Tag5", "#Tag6"],
  "especificacoes": ["Spec1", "Spec2", "Spec3"],
  "categoriaSugerida": "categoria TikTok Shop"
}`
  },
  magalu: {
    systemPrompt: `Você é um especialista em vendas na Magalu (Magazine Luiza), o marketplace premium brasileiro. Suas listagens são profissionais, completas e transmitem confiança. Você conhece o público Magalu que valoriza qualidade e bom atendimento. SEMPRE responda em JSON válido.`,
    userPrompt: `Analise a foto do produto e gere uma listagem PROFISSIONAL para Magalu.

Retorne APENAS um JSON válido com esta estrutura:

{
  "titulo": "Título profissional e descritivo (max 150 chars, Marca + Produto + Diferencial)",
  "descricao": "Descrição completa e estruturada:\n\n📌 SOBRE O PRODUTO\nParágrafo introdutório\n\n⭐ BENEFÍCIOS\n• Benefício 1\n• Benefício 2\n• Benefício 3\n\n🔧 CARACTERÍSTICAS\nDescrição técnica detalhada\n\n📐 ESPECIFICAÇÕES\nMedidas e detalhes técnicos\n\n✅ DIFERENCIAIS\nO que torna este produto especial",
  "destaques": [
    "Destaque 1 - benefício principal",
    "Destaque 2 - qualidade/material",
    "Destaque 3 - versatilidade",
    "Destaque 4 - garantia/confiança",
    "Destaque 5 - custo-benefício"
  ],
  "especificacoes": {"Marca": "...", "Material": "...", "Dimensões": "...", "Peso": "...", "Cor": "...", "Garantia": "...", "Voltagem": "..."},
  "palavrasChave": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "categoriaSugerida": "categoria Magalu mais adequada"
}`
  }
};

async function callClaude(systemPrompt, userContent, maxTokens = 3000) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userContent
      }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

function formatResultForDisplay(marketplace, structured) {
  let text = '';

  if (structured.titulo) {
    text += `📌 TÍTULO\n${structured.titulo}\n\n`;
  }

  if (structured.descricao) {
    text += `📝 DESCRIÇÃO\n${structured.descricao}\n\n`;
  }

  if (structured.bullets && structured.bullets.length > 0) {
    text += `🎯 BULLET POINTS\n${structured.bullets.map(b => `• ${b}`).join('\n')}\n\n`;
  }

  if (structured.fichaTecnica && structured.fichaTecnica.length > 0) {
    text += `📋 FICHA TÉCNICA\n${structured.fichaTecnica.map(f => `• ${f}`).join('\n')}\n\n`;
  }

  if (structured.destaques && structured.destaques.length > 0) {
    text += `⭐ DESTAQUES\n${structured.destaques.map(d => `• ${d}`).join('\n')}\n\n`;
  }

  if (structured.hooksVideo && structured.hooksVideo.length > 0) {
    text += `🎬 HOOKS PARA VÍDEO\n${structured.hooksVideo.map(h => `• ${h}`).join('\n')}\n\n`;
  }

  if (structured.roteiroVideo15s) {
    text += `🎥 ROTEIRO DE VÍDEO (15s)\n`;
    Object.entries(structured.roteiroVideo15s).forEach(([key, val]) => {
      text += `• ${val}\n`;
    });
    text += '\n';
  }

  if (structured.hashtags && structured.hashtags.length > 0) {
    text += `#️⃣ HASHTAGS\n${structured.hashtags.join(' ')}\n\n`;
  }

  if (structured.palavrasChave && structured.palavrasChave.length > 0) {
    text += `🔑 PALAVRAS-CHAVE\n${structured.palavrasChave.join(', ')}\n\n`;
  }

  if (structured.termosBackend) {
    text += `🔍 TERMOS BACKEND\n${structured.termosBackend}\n\n`;
  }

  if (structured.faixaPreco && structured.faixaPreco.min > 0) {
    text += `💰 FAIXA DE PREÇO SUGERIDA\nR$ ${structured.faixaPreco.min} - R$ ${structured.faixaPreco.max}\n\n`;
  }

  if (structured.textoFlashDeal) {
    text += `⚡ TEXTO FLASH DEAL\n${structured.textoFlashDeal}\n\n`;
  }

  if (structured.envio) {
    text += `📦 ENVIO\nEmbalagem: ${structured.envio.embalagem || 'N/A'}\nPeso: ${structured.envio.pesoEstimado || 'N/A'}\nDimensões: ${structured.envio.dimensoes || 'N/A'}\n\n`;
  }

  if (structured.especificacoes) {
    if (Array.isArray(structured.especificacoes)) {
      text += `📐 ESPECIFICAÇÕES\n${structured.especificacoes.map(e => `• ${e}`).join('\n')}\n\n`;
    } else {
      text += `📐 ESPECIFICAÇÕES\n${Object.entries(structured.especificacoes).map(([k,v]) => `• ${k}: ${v}`).join('\n')}\n\n`;
    }
  }

  if (structured.categoriaSugerida) {
    text += `📂 CATEGORIA SUGERIDA\n${structured.categoriaSugerida}\n`;
  }

  return text;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, marketplace, category } = req.body;

    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 é obrigatório' });

    // Default to mercadolivre if no marketplace specified (backward compatibility)
    const mkt = (marketplace || 'mercadolivre').toLowerCase().replace(/[\s-]/g, '');

    const config = MARKETPLACE_PROMPTS[mkt];
    if (!config) {
      return res.status(400).json({
        error: `Marketplace "${marketplace}" não suportado. Use: mercadolivre, amazon, shopee, tiktokshop, magalu`
      });
    }

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });
    }

    // Clean base64 (remove data URL prefix if present)
    const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    // Single call to Claude: analyze image + generate marketplace content
    const userContent = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: base64
        }
      },
      {
        type: 'text',
        text: config.userPrompt + (category ? `\n\nDica adicional: o produto pertence à categoria "${category}".` : '')
      }
    ];

    const responseText = await callClaude(config.systemPrompt, userContent, 4000);

    // Parse JSON response
    let structured;
    try {
      let jsonText = responseText;
      // Remove markdown code blocks if present
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) jsonText = jsonMatch[1];
      structured = JSON.parse(jsonText.trim());
    } catch (e) {
      // Fallback: return raw text
      structured = { titulo: 'Produto', descricao: responseText };
    }

    // Format for display (backward compatible with frontend)
    const displayText = formatResultForDisplay(mkt, structured);

    return res.status(200).json({
      result: displayText,
      structured: structured,
      marketplace: mkt
    });

  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: 'Erro ao gerar anúncio', details: error.message });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64, marketplace } = req.body;

    if (!imageBase64 || !marketplace) {
      return res.status(400).json({ error: 'Missing imageBase64 or marketplace' });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'AI API key not configured' });
    }

    const marketplaceInstructions = {
      mercadolivre: `
OTIMIZAÇÃO PARA MERCADO LIVRE BRASIL:
- Títulos: até 80 caracteres, comece com a categoria principal, inclua marca e principais características
- Estrutura título: [Produto] [Marca] [Principais características] [Condição]
- Descrição: formatada com tópicos claros, sem emojis, foque em segurança, qualidade e atendimento
- Utilize palavras-chave com alto volume de busca no Mercado Livre
- Categoria: escolha a subcategoria mais específica disponível no catálogo
- Preço: seja competitivo, considere a concorrência e custos de frete
- Evite: palavras proibidas como "grátis", "melhor preço", "loja oficial"
- Público: compradores brasileiros buscando segurança e bom atendimento
      `,
      amazon: `
OTIMIZAÇÃO PARA AMAZON BRASIL:
- Títulos: até 200 caracteres, estrutura: [Marca] [Produto] [Atributos principais]
- Insira palavras-chave naturalmente no título para melhorar ranking
- Descrição: máximo 5 bullet points, focados em benefícios e especificações técnicas
- Utilize palavras-chave de cauda longa e long-tail keywords
- Categoria: escolha a categoria exata do catálogo Amazon.com.br
- Preço: considere algoritmo de buybox, seja competitivo
- Ênfase em: compatibilidade, entrega rápida, garantia, devolução fácil
- Evite: comparações diretas com concorrentes
      `,
      shopee: `
OTIMIZAÇÃO PARA SHOPEE BRASIL:
- Títulos: até 150 caracteres, otimizados para busca mobile
- Destaque promoção/desconto no início do título se aplicável
- Descrição: concisa e visual com emojis estratégicos para atrair atenção
- Use palavras-chave populares na busca da plataforma Shopee
- Categoria: escolha com precisão subcategorias bem definidas
- Preço: utilize cupons e promoções flash sales para competitividade
- Apelo: buscas mobile "novo", "promoção", "frete grátis", "estoque limitado"
- Informações essenciais: condições de envio, política de devolução
      `,
      tiktokshop: `
OTIMIZAÇÃO PARA TIKTOK SHOP BRASIL:
- Títulos: criativos e virais (até 100 caracteres), use trending topics
- Linguagem: Gen Z, descontraída, autêntica, engajante
- Descrição: informal com emojis relevantes e hashtags trending
- Palavras-chave: alinhadas com tendências atuais do TikTok
- Categoria: conforme catálogo oficial TikTok Shop
- Preço: apele para "super oferta", "estoque limitado", "promoção relâmpago"
- Público: geração jovem, buscam trendiness, affordability, viral potential
- Estimule comentários e compartilhamentos
      `,
      shein: `
OTIMIZAÇÃO PARA SHEIN (MARKETPLACE GLOBAL):
- Títulos: até 120 caracteres, foco em estilo, trend e apelo fashion
- Descrição: bilíngue (português e inglês), duração média, storytelling
- Palavras-chave: fashion, lifestyle, tendências atuais, apelo global
- Categoria: moda/lifestyle com subcategorias fashion-specific
- Preço: competitivo para varejo internacional, não excessivo
- Destaque: estilo único, conforto, sustentabilidade se aplicável
- Termos-chave: "trendy", "comfortable", "stylish", "affordable", "quality"
- Público: jovens fashion-forward, seguem tendências globais
      `,
      instagram: `
OTIMIZAÇÃO PARA INSTAGRAM SHOPPING:
- Títulos: criativos e apetitosos (até 100 caracteres), capturam atenção
- Descrição: storytelling emocional que conecta com audiência
- Hashtags: 15-30 estratégicas para alcance orgânico máximo
- Palavras-chave: visuais e emocionais, ressonância com lifestyle
- Categoria: conforme Instagram Shop guidelines oficiais
- Preço: claro com CTA (chamada para ação) definida
- Ênfase em: experiência visual, lifestyle aspiracional, comunidade
- Urgência: "estoque limitado", "últimas peças", "edição exclusiva"
      `
    };

    const instructions = marketplaceInstructions[marketplace] || marketplaceInstructions.mercadolivre;

    let mediaType = 'image/jpeg';
    if (imageBase64.startsWith('data:image/png')) mediaType = 'image/png';
    else if (imageBase64.startsWith('data:image/webp')) mediaType = 'image/webp';
    else if (imageBase64.startsWith('data:image/gif')) mediaType = 'image/gif';

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const prompt = `Você é um especialista em otimização de anúncios para marketplaces brasileiros e plataformas de e-commerce internacional.

MARKETPLACE: ${marketplace.toUpperCase()}
${instructions}

ANÁLISE DETALHADA E MINUCIOSA DO PRODUTO:
Examine a imagem com extrema atenção. Identifique e documente:

1. TIPO E NOME DO PRODUTO: Qual é exatamente este produto? Descreva sua função principal.
2. MARCA/FABRICANTE: Se visível, identifique a marca. Se não identificável, marque como "Genérica".
3. CONDIÇÃO: É novo (nunca usado), usado, seminovo ou com defeito? Há sinais de desgaste, danos ou alterações?
4. COR(ES): Todas as cores visíveis. Se houver variações, liste todas.
5. MATERIAL(IS): Identifique todos os materiais visíveis (algodão, poliéster, plástico, metal, vidro, couro, silicone, etc).
6. TAMANHO/DIMENSÕES: Se possível inferir tamanho ou se há indicação visual de escala. P, M, G ou medidas específicas?
7. QUALIDADE VISUAL: Avalie qualidade geral: excelente (novo/perfeito), boa (bem conservado), aceitável (desgastado) ou ruim.
8. CARACTERÍSTICAS ÚNICAS: Qualquer detalhe especial, diferencial, features exclusivas ou inovadoras.
9. PREÇO ESTIMADO: Baseado em tipo, marca, qualidade e condição, qual seria a faixa de preço realista no Brasil?

ESTRUTURA JSON OBRIGATÓRIA (responda APENAS com JSON válido, nenhum texto adicional):

{
  "titles": [
      "Título 1 otimizado para SEO com palavras-chave naturais",
      "Título 2 com variação de abordagem e diferentes keywords",
      "Título 3 focando em benefícios e diferenciais do produto",
      "Título 4 com ênfase em promoção ou urgência se apropriado"
    ],
    "description": "Descrição rica e atrativa com estrutura de bullet points. Explique características, benefícios práticos, material, tamanho, condição, qualidade, uso recomendado, e por que este produto é uma boa compra. Seja detalhista mas conciso. Use formatação clara.",
    "keywords": "palavra-chave1, palavra-chave2, palavra-chave3, palavra-chave4, palavra-chave5, palavra-chave6, palavra-chave7, palavra-chave8, palavra-chave9, palavra-chave10",
    "category": "Categoria principal conforme o marketplace especificado",
    "priceRange": "R$ XXX - R$ YYY",
    "attributes": {
      "brand": "Nome da marca ou 'Genérica' se não identificada",
      "color": "Cor ou cores principais separadas por vírgula",
      "material": "Material ou materiais identificados na imagem",
      "size": "Tamanho/Dimensão inferido ou 'Não identificado'",
      "condition": "novo|usado|seminovo|defeituoso"
    },
    "quality": {
      "score": 0-100,
      "checks": {
        "titleSEO": true/false,
        "descriptionComplete": true/false,
        "keywordsRelevant": true/false,
        "categoryAccurate": true/false,
        "priceRealistic": true/false
      }
  }
}

CRITÉRIOS PARA QUALITY SCORE:
- titleSEO: Os títulos incluem keywords relevantes? Têm estrutura otimizada para busca?
- descriptionComplete: A descrição tem detalhes suficientes, é clara, atrativa e honest?
- keywordsRelevant: As 10 palavras-chave refletem exatamente o produto e buscas reais?
- categoryAccurate: A categoria faz sentido perfeito para este produto no marketplace?
- priceRealistic: O preço estimado é realista e competitivo no mercado brasileiro atual?

REGRAS CRÍTICAS:
- Retorne APENAS JSON válido e bem formado, zero texto adicional
- Os 4 títulos devem ser diferentes em abordagem, cada um focando ângulo diferente
- As 10 palavras-chave devem ser termos reais com volume de busca real
- A descrição deve ser atrativa, honesta e focada no público-alvo
- Sempre considere o público específico do marketplace escolhido
- Se não conseguir identificar algo (marca, tamanho), deixe como "Não identificado"
- Quality score deve refletir viabilidade REAL do anúncio`;

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!anthropicResponse.ok) {
      const errorData = await anthropicResponse.json().catch(() => ({}));
      console.error('Anthropic API error:', errorData);
      return res.status(500).json({
        error: 'AI service error',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const aiResult = await anthropicResponse.json();
    const content = aiResult.content?.[0]?.text;

    if (!content) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    let parsed;
    try {
      // Extract JSON from response, handling markdown code blocks
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', content);
      return res.status(500).json({
        error: 'Failed to parse AI response',
        raw: content
      });
    }

    // Normalize: AI might return {listing:{...}} or just the listing fields directly
    let listing = parsed.listing || parsed;

    // Ensure titles is an array
    if (!Array.isArray(listing.titles)) {
      listing.titles = listing.title ? [listing.title] : ['Titulo nao gerado'];
    }

    // Ensure attributes exist
    if (!listing.attributes) {
      listing.attributes = { brand: 'Nao identificado', color: 'Nao identificado', material: 'Nao identificado', size: 'Nao identificado', condition: 'novo' };
    }

    // Ensure quality exists
    if (!listing.quality) {
      listing.quality = { score: 70, checks: { titleSEO: true, descriptionComplete: true, keywordsRelevant: true, categoryAccurate: true, priceRealistic: true } };
    }

    return res.status(200).json({ success: true, listing });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

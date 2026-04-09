import sharp from 'sharp';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

const marketplaceConfigs = {
  mercadolivre: {
    name: 'Mercado Livre',
    systemPrompt: `Você é um especialista em criação de anúncios para o Mercado Livre Brasil. Você conhece profundamente as regras do algoritmo de busca do Mercado Livre, otimização de títulos com até 60 caracteres, e as melhores práticas de conversão. Sempre responda em português brasileiro.`,
    userPrompt: (productName, productDescription) => `Analise esta foto do produto e crie um anúncio COMPLETO e otimizado para o Mercado Livre.

Nome do produto informado: ${productName || 'Identificar pela foto'}
Descrição adicional: ${productDescription || 'Nenhuma'}

Gere TODOS os campos abaixo em formato JSON:
{
  "titulo": "título otimizado para SEO do ML (máx 60 chars, palavras-chave no início)",
  "categoria_sugerida": "categoria mais adequada no ML",
  "preco_sugerido": "faixa de preço sugerida baseada no mercado",
  "descricao": "descrição completa e persuasiva (mín 300 palavras) com bullet points, benefícios, especificações técnicas, e chamada para ação",
  "ficha_tecnica": {"campo1": "valor1", "campo2": "valor2"},
  "palavras_chave": ["palavra1", "palavra2", "palavra3"],
  "dicas_foto": "orientações específicas para as 12 fotos do ML",
  "tags_busca": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`
  },
  amazon: {
    name: 'Amazon',
    systemPrompt: `Você é um especialista em criação de listings para Amazon Brasil. Conhece profundamente o algoritmo A9/A10, otimização de títulos com marca + atributos + benefício, bullet points estratégicos, e Enhanced Brand Content. Sempre responda em português brasileiro.`,
    userPrompt: (productName, productDescription) => `Analise esta foto do produto e crie um listing COMPLETO e otimizado para a Amazon Brasil.

Nome do produto informado: ${productName || 'Identificar pela foto'}
Descrição adicional: ${productDescription || 'Nenhuma'}

Gere TODOS os campos abaixo em formato JSON:
{
  "titulo": "título otimizado para Amazon (Marca + Linha + Material + Atributo-chave + Tamanho/Cor, máx 200 chars)",
  "bullet_points": ["bullet 1 com benefício + feature", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "descricao": "descrição completa em HTML leve para A+ Content, mín 300 palavras, com storytelling e benefícios",
  "backend_keywords": "termos de busca backend (máx 250 bytes, sem repetir palavras do título)",
  "preco_sugerido": "faixa de preço sugerida",
  "categoria_sugerida": "categoria Amazon mais adequada",
  "ficha_tecnica": {"campo1": "valor1", "campo2": "valor2"},
  "dicas_foto": "orientações para fotos Amazon (fundo branco obrigatório, mín 1000x1000px, 7 imagens)"
}`
  },
  shopee: {
    name: 'Shopee',
    systemPrompt: `Você é um especialista em vendas na Shopee Brasil. Conhece profundamente o algoritmo de busca da Shopee, uso estratégico de hashtags, otimização de títulos com emojis, e técnicas de conversão para o público da plataforma. Sempre responda em português brasileiro.`,
    userPrompt: (productName, productDescription) => `Analise esta foto do produto e crie um anúncio COMPLETO e otimizado para a Shopee Brasil.

Nome do produto informado: ${productName || 'Identificar pela foto'}
Descrição adicional: ${productDescription || 'Nenhuma'}

Gere TODOS os campos abaixo em formato JSON:
{
  "titulo": "título otimizado para Shopee com emojis estratégicos (máx 120 chars)",
  "descricao": "descrição completa com emojis, bullet points com ✅, benefícios destacados, e chamada urgente (mín 300 palavras). Use linguagem informal e persuasiva.",
  "preco_sugerido": "faixa de preço sugerida (considerar que Shopee é mais competitivo em preço)",
  "categoria_sugerida": "categoria Shopee mais adequada",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "palavras_chave": ["palavra1", "palavra2", "palavra3"],
  "dicas_foto": "orientações para fotos Shopee (máx 1MB cada, fundo clean, até 9 fotos)",
  "dicas_promocao": "sugestões de cupons e promoções para a Shopee"
}`
  },
  tiktokshop: {
    name: 'TikTok Shop',
    systemPrompt: `Você é um especialista em vendas no TikTok Shop Brasil. Conhece profundamente a linguagem Gen-Z, criação de conteúdo viral, storytelling rápido, e otimização de listings para a plataforma. Sempre responda em português brasileiro.`,
    userPrompt: (productName, productDescription) => `Analise esta foto do produto e crie um listing COMPLETO e otimizado para o TikTok Shop.

Nome do produto informado: ${productName || 'Identificar pela foto'}
Descrição adicional: ${productDescription || 'Nenhuma'}

Gere TODOS os campos abaixo em formato JSON:
{
  "titulo": "título curto e chamativo para TikTok Shop (máx 80 chars, linguagem jovem)",
  "descricao": "descrição curta e impactante com emojis, focada em benefícios visuais e tendências (150-200 palavras)",
  "roteiro_video": "roteiro para vídeo vertical 9:16 de 30-60 segundos mostrando o produto (hook nos primeiros 3 segundos, demonstração, call to action)",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#fyp", "#tiktokshop"],
  "preco_sugerido": "faixa de preço sugerida (impulso por preço acessível)",
  "categoria_sugerida": "categoria TikTok Shop mais adequada",
  "dicas_conteudo": "sugestões de trends e formatos de vídeo que funcionam para este produto",
  "sons_sugeridos": "tipos de áudio/música trending que combinam com o produto"
}`
  },
  magalu: {
    name: 'Magazine Luiza',
    systemPrompt: `Você é um especialista em vendas no marketplace da Magazine Luiza (Magalu). Conhece profundamente as regras de cadastro de produtos, otimização de fichas técnicas, e as melhores práticas para sellers no Magalu. Sempre responda em português brasileiro.`,
    userPrompt: (productName, productDescription) => `Analise esta foto do produto e crie um anúncio COMPLETO e otimizado para o Magalu Marketplace.

Nome do produto informado: ${productName || 'Identificar pela foto'}
Descrição adicional: ${productDescription || 'Nenhuma'}

Gere TODOS os campos abaixo em formato JSON:
{
  "titulo": "título otimizado para Magalu (claro, descritivo, com marca e modelo, máx 150 chars)",
  "descricao": "descrição completa e profissional (mín 300 palavras) com especificações detalhadas, benefícios, e instruções de uso",
  "preco_sugerido": "faixa de preço sugerida",
  "categoria_sugerida": "categoria Magalu mais adequada",
  "ficha_tecnica": {"campo1": "valor1", "campo2": "valor2"},
  "palavras_chave": ["palavra1", "palavra2", "palavra3"],
  "dicas_foto": "orientações para fotos no Magalu (fundo branco, alta resolução, múltiplos ângulos)",
  "selo_qualidade": "dicas para obter selo de qualidade Magalu"
}`
  },
  shein: {
    name: 'Shein',
    systemPrompt: `Você é um especialista em vendas na Shein Marketplace Brasil. Conhece profundamente o público-alvo jovem e feminino da plataforma, tendências de moda fast-fashion, estratégias de preço competitivo, e otimização de listings para alta conversão na Shein. Sempre responda em português brasileiro.`,
    userPrompt: (productName, productDescription) => `Analise esta foto do produto e crie um listing COMPLETO e otimizado para a Shein Brasil.

Nome do produto informado: ${productName || 'Identificar pela foto'}
Descrição adicional: ${productDescription || 'Nenhuma'}

Gere TODOS os campos abaixo em formato JSON:
{
  "titulo": "título otimizado para Shein (descritivo, com estilo/tendência, máx 128 chars, em português)",
  "descricao": "descrição completa com foco em estilo, ocasiões de uso, combinações, tecido/material, e tabela de medidas se aplicável (200-300 palavras)",
  "preco_sugerido": "faixa de preço sugerida (considerar competitividade extrema da Shein)",
  "categoria_sugerida": "categoria Shein mais adequada",
  "atributos": {"cor": "valor", "material": "valor", "estilo": "valor", "ocasiao": "valor"},
  "palavras_chave": ["palavra1", "palavra2", "palavra3", "palavra4", "palavra5"],
  "dicas_foto": "orientações para fotos Shein (modelo vestindo, flat lay, detalhes de textura, fundo clean, mín 3 fotos)",
  "tendencias": "tendências atuais de moda que se conectam com este produto"
}`
  },
  instagram: {
    name: 'Instagram Shopping',
    systemPrompt: `Você é um especialista em Instagram Shopping e social commerce. Conhece profundamente as melhores práticas de catálogo de produtos no Instagram, criação de posts shoppable, stories com tags de produto, e estratégias de conversão via Instagram. Sempre responda em português brasileiro.`,
    userPrompt: (productName, productDescription) => `Analise esta foto do produto e crie um listing COMPLETO e otimizado para o Instagram Shopping.

Nome do produto informado: ${productName || 'Identificar pela foto'}
Descrição adicional: ${productDescription || 'Nenhuma'}

Gere TODOS os campos abaixo em formato JSON:
{
  "titulo": "nome do produto para catálogo Instagram (claro e atrativo, máx 65 chars)",
  "descricao_catalogo": "descrição para o catálogo de produtos (máx 200 chars, objetiva)",
  "caption_post": "legenda completa para post no feed com o produto (storytelling, emojis estratégicos, call to action, 150-250 palavras)",
  "caption_stories": "texto curto e impactante para stories (máx 50 palavras, com urgência)",
  "caption_reels": "roteiro/legenda para Reels mostrando o produto (hook + demonstração + CTA, 100-150 palavras)",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "até 30 hashtags relevantes"],
  "preco_sugerido": "faixa de preço sugerida",
  "dicas_foto": "orientações para fotos Instagram (lifestyle, aesthetic, cores quentes, boa iluminação)",
  "horarios_postagem": "melhores horários para postar conteúdo de produto no Brasil"
}`
  }
};

function formatResultForDisplay(structured, marketplace) {
  const config = marketplaceConfigs[marketplace] || marketplaceConfigs.mercadolivre;
  let display = '';

  try {
    const data = typeof structured === 'string' ? JSON.parse(structured) : structured;

    display += `📦 ANÚNCIO PARA ${config.name.toUpperCase()}\n`;
    display += `${'═'.repeat(50)}\n\n`;

    if (data.titulo) {
      display += `📝 TÍTULO:\n${data.titulo}\n\n`;
    }

    if (data.categoria_sugerida) {
      display += `📂 CATEGORIA: ${data.categoria_sugerida}\n\n`;
    }

    if (data.preco_sugerido) {
      display += `💰 PREÇO SUGERIDO: ${data.preco_sugerido}\n\n`;
    }

    if (data.bullet_points) {
      display += `🔹 BULLET POINTS:\n`;
      data.bullet_points.forEach((bp, i) => {
        display += `  ${i + 1}. ${bp}\n`;
      });
      display += '\n';
    }

    if (data.descricao || data.descricao_catalogo) {
      display += `📄 DESCRIÇÃO:\n${data.descricao || data.descricao_catalogo}\n\n`;
    }

    if (data.caption_post) {
      display += `📸 LEGENDA PARA POST:\n${data.caption_post}\n\n`;
    }

    if (data.caption_stories) {
      display += `📱 STORIES:\n${data.caption_stories}\n\n`;
    }

    if (data.caption_reels) {
      display += `🎬 REELS:\n${data.caption_reels}\n\n`;
    }

    if (data.roteiro_video) {
      display += `🎬 ROTEIRO DE VÍDEO:\n${data.roteiro_video}\n\n`;
    }

    if (data.ficha_tecnica || data.atributos) {
      const tecnica = data.ficha_tecnica || data.atributos;
      display += `📋 FICHA TÉCNICA:\n`;
      Object.entries(tecnica).forEach(([key, value]) => {
        display += `  • ${key}: ${value}\n`;
      });
      display += '\n';
    }

    if (data.palavras_chave) {
      display += `🔍 PALAVRAS-CHAVE: ${data.palavras_chave.join(', ')}\n\n`;
    }

    if (data.backend_keywords) {
      display += `🔍 BACKEND KEYWORDS: ${data.backend_keywords}\n\n`;
    }

    if (data.hashtags) {
      display += `#️⃣ HASHTAGS: ${data.hashtags.join(' ')}\n\n`;
    }

    if (data.tags_busca) {
      display += `🏷️ TAGS: ${data.tags_busca.join(', ')}\n\n`;
    }

    if (data.dicas_foto) {
      display += `📸 DICAS DE FOTO:\n${data.dicas_foto}\n\n`;
    }

    if (data.dicas_conteudo) {
      display += `💡 DICAS DE CONTEÚDO:\n${data.dicas_conteudo}\n\n`;
    }

    if (data.dicas_promocao) {
      display += `🎁 DICAS DE PROMOÇÃO:\n${data.dicas_promocao}\n\n`;
    }

    if (data.tendencias) {
      display += `🔥 TENDÊNCIAS:\n${data.tendencias}\n\n`;
    }

    if (data.sons_sugeridos) {
      display += `🎵 SONS SUGERIDOS:\n${data.sons_sugeridos}\n\n`;
    }

    if (data.selo_qualidade) {
      display += `⭐ SELO QUALIDADE:\n${data.selo_qualidade}\n\n`;
    }

    if (data.horarios_postagem) {
      display += `🕐 MELHORES HORÁRIOS:\n${data.horarios_postagem}\n\n`;
    }

  } catch (e) {
    display = structured;
  }

  return display;
}

export default async function handler(req, res) {
  // CORS headers
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
    const { image, productName, productDescription, marketplace = 'mercadolivre' } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Get marketplace config (default to mercadolivre)
    const mkt = marketplace.toLowerCase().replace(/\s+/g, '');
    const config = marketplaceConfigs[mkt] || marketplaceConfigs.mercadolivre;

    // Clean base64 image
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    // Detect image type
    let mediaType = 'image/jpeg';
    if (image.startsWith('data:image/png')) mediaType = 'image/png';
    else if (image.startsWith('data:image/webp')) mediaType = 'image/webp';
    else if (image.startsWith('data:image/gif')) mediaType = 'image/gif';

    // Build the user prompt
    const userPromptText = config.userPrompt(productName, productDescription);

    // Call Claude API with vision
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: config.systemPrompt,
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
                text: userPromptText
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(response.status).json({
        error: `Claude API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    const resultText = data.content[0].text;

    // Try to parse JSON from response
    let structured = null;
    try {
      // Find JSON in the response
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        structured = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.log('Could not parse structured data:', e.message);
    }

    // Format display text
    const displayText = structured
      ? formatResultForDisplay(structured, mkt)
      : resultText;

    return res.status(200).json({
      result: displayText,
      structured: structured || resultText,
      marketplace: mkt,
      marketplaceName: config.name
    });

  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({
      error: 'Failed to generate listing',
      details: error.message
    });
  }
}

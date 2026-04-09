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
    const { imageBase64, marketplace } = req.body;

    if (!imageBase64 || !marketplace) {
      return res.status(400).json({ error: 'Missing imageBase64 or marketplace' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'AI API key not configured' });
    }

    // Marketplace-specific instructions
    const marketplaceInstructions = {
      mercadolivre: `Gere um anuncio otimizado para o Mercado Livre Brasil.
        - Titulo: maximo 60 caracteres, use palavras-chave de busca, sem emojis
        - Descricao: detalhada, com caracteristicas, especificacoes, formas de pagamento e entrega. Use checkmarks e formatacao limpa
        - Palavras-chave: 5-8 termos relevantes separados por virgula
        - Categoria: sugira a categoria mais adequada do Mercado Livre
        - Faixa de preco: em Reais (R$), baseado no mercado brasileiro`,
      amazon: `Gere um anuncio otimizado para a Amazon Brasil.
        - Titulo: maximo 200 caracteres, inclua marca, modelo, cor, tamanho se aplicavel
        - Descricao: formato bullet points profissional, com features e beneficios
        - Palavras-chave: 5-8 termos de busca relevantes separados por virgula
        - Categoria: sugira a categoria mais adequada da Amazon
        - Faixa de preco: em Reais (R$), baseado no mercado brasileiro`,
      shopee: `Gere um anuncio otimizado para a Shopee Brasil.
        - Titulo: maximo 120 caracteres, use emojis estrategicamente, palavras-chave de busca
        - Descricao: use emojis, formato visual atraente, destaque promocoes e frete
        - Palavras-chave: 5-8 termos relevantes separados por virgula
        - Categoria: sugira a categoria mais adequada da Shopee
        - Faixa de preco: em Reais (R$), competitivo para Shopee`,
      tiktokshop: `Gere um anuncio otimizado para o TikTok Shop Brasil.
        - Titulo: maximo 100 caracteres, use emojis chamativos, linguagem jovem e viral
        - Descricao: formato visual com emojis, linguagem informal e engajante, destaque frete gratis
        - Palavras-chave: 5-8 termos trending separados por virgula
        - Categoria: sugira a categoria mais adequada do TikTok Shop
        - Faixa de preco: em Reais (R$), competitivo com apelo promocional`
    };

    const instructions = marketplaceInstructions[marketplace] || marketplaceInstructions.mercadolivre;

    // Determine image media type
    let mediaType = 'image/jpeg';
    if (imageBase64.startsWith('data:image/png')) mediaType = 'image/png';
    else if (imageBase64.startsWith('data:image/webp')) mediaType = 'image/webp';
    else if (imageBase64.startsWith('data:image/gif')) mediaType = 'image/gif';

    // Remove data URL prefix if present
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Voce e um especialista em e-commerce e marketplaces brasileiros. Sua funcao e analisar fotos de produtos e gerar anuncios profissionais e otimizados para venda.

Sempre responda em formato JSON valido com exatamente estas chaves:
{
  "title": "titulo do anuncio",
  "description": "descricao completa",
  "keywords": "palavra1, palavra2, palavra3",
  "category": "Categoria > Subcategoria",
  "priceRange": "R$ XX,XX - R$ YY,YY"
}

Analise a foto do produto cuidadosamente. Identifique:
- O que e o produto
- Marca visivel (se houver)
- Cor, tamanho, material
- Estado (novo/usado)
- Detalhes relevantes para o comprador`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: instructions
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mediaType};base64,${base64Data}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json().catch(() => ({}));
      console.error('OpenAI API error:', errorData);
      return res.status(500).json({ error: 'AI service error', details: errorData.error?.message || 'Unknown error' });
    }

    const aiResult = await openaiResponse.json();
    const content = aiResult.choices[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    // Parse JSON from AI response (handle markdown code blocks)
    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', content);
      return res.status(500).json({ error: 'Failed to parse AI response', raw: content });
    }

    return res.status(200).json({
      success: true,
      listing: {
        title: parsed.title || '',
        description: parsed.description || '',
        keywords: parsed.keywords || '',
        category: parsed.category || '',
        priceRange: parsed.priceRange || parsed.price_range || ''
      }
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
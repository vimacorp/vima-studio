export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var { listing, platform, tone } = req.body;
    if (!listing) return res.status(400).json({ error: 'listing object is required' });

    var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI API key not configured' });

    var selectedPlatform = platform || 'instagram';
    var selectedTone = tone || 'descontraido';

    var productInfo = 'Titulos: ' + (listing.titles || []).join(' | ') + '\n' +
      'Descricao: ' + (listing.description || '') + '\n' +
      'Keywords: ' + (listing.keywords || '') + '\n' +
      'Preco: ' + (listing.priceRange || '') + '\n' +
      'Marca: ' + (listing.attributes && listing.attributes.brand || 'Generica') + '\n' +
      'Cor: ' + (listing.attributes && listing.attributes.color || '') + '\n' +
      'Material: ' + (listing.attributes && listing.attributes.material || '') + '\n' +
      'Condicao: ' + (listing.attributes && listing.attributes.condition || 'novo');

    var toneMap = {
      descontraido: 'Descontraido, divertido, usa girias e emojis, como um influencer jovem e animado',
      profissional: 'Profissional e confiavel, como um especialista ou consultor do nicho, usa dados e fatos',
      luxo: 'Sofisticado e elegante, como um influencer de lifestyle premium, linguagem refinada',
      genuino: 'Autentico e sincero, como alguem que realmente testou e amou o produto, relato pessoal',
      humor: 'Comico e engracado, usa humor e memes, viral e compartilhavel',
      tecnico: 'Tecnico e detalhista, como um reviewer especializado, foca em specs e comparacoes'
    };

    var platformMap = {
      instagram: { name: 'Instagram', specs: 'Caption ate 2200 caracteres, 20-30 hashtags estrategicas, formato visual, stories e reels' },
      tiktok: { name: 'TikTok', specs: 'Script de video 15-60s, hook nos primeiros 3s, trending sounds, hashtags virais, CTA forte' },
      youtube: { name: 'YouTube', specs: 'Roteiro de review 3-5min, thumbnail title, descricao SEO, tags, timestamps, CTA subscribe' },
      twitter: { name: 'X/Twitter', specs: 'Thread de 3-5 tweets, 280 chars cada, hashtags relevantes, tom conversacional, CTA final' },
      blog: { name: 'Blog/Site', specs: 'Artigo review 500-800 palavras, SEO otimizado, H2/H3, pros e contras, nota final, CTA' }
    };

    var platInfo = platformMap[selectedPlatform] || platformMap.instagram;
    var toneDesc = toneMap[selectedTone] || toneMap.descontraido;

    var prompt = 'Voce e uma IA Influencer especialista em marketing de produtos para e-commerce brasileiro.\n\nPRODUTO:\n' + productInfo + '\n\nPLATAFORMA: ' + platInfo.name + '\nESPECIFICACOES: ' + platInfo.specs + '\n\nTOM/PERSONA: ' + toneDesc + '\n\nCrie conteudo de influencer digital para promover este produto. O conteudo deve parecer 100% autentico, como se um influencer real estivesse recomendando.\n\nREGRAS:\n- Conteudo 100% em portugues brasileiro natural\n- Deve parecer organico, NAO parecer anuncio pago\n- Inclua emojis de forma natural e estrategica\n- Adapte linguagem ao tom/persona escolhido\n- Inclua CTA (chamada para acao) natural\n- Mencione preco se disponivel\n- Crie conteudo pronto para copiar e colar\n- Seja criativo e engajante\n\nResponda APENAS JSON valido:\n{\n  "mainContent": "O conteudo principal completo (caption, script, artigo, thread) pronto para uso",\n  "hook": "Frase de gancho inicial para captar atencao nos primeiros 3 segundos",\n  "hashtags": ["hashtag1", "hashtag2", "ate20hashtags"],\n  "cta": "Chamada para acao principal",\n  "alternativeVersions": [\n    {"label": "Versao curta", "content": "Versao resumida do conteudo para formato stories ou post rapido"},\n    {"label": "Versao engajamento", "content": "Versao focada em gerar comentarios e compartilhamentos"}\n  ],\n  "suggestedVisual": "Descricao da imagem/video ideal para acompanhar este conteudo",\n  "bestTimeToPost": "Melhor horario/dia para postar este tipo de conteudo",\n  "estimatedEngagement": "Estimativa de alcance e engajamento esperado"\n}';

    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      var e = await r.json().catch(function() { return {}; });
      return res.status(500).json({ error: 'AI error', details: e.error && e.error.message || 'Unknown' });
    }

    var ai = await r.json();
    var txt = ai.content && ai.content[0] && ai.content[0].text;
    if (!txt) return res.status(500).json({ error: 'No AI response' });

    var parsed;
    try {
      var jsonMatch = txt.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return res.status(500).json({ error: 'Parse error', raw: txt });
    }

    if (!parsed.mainContent) parsed.mainContent = 'Conteudo nao gerado';
    if (!parsed.hook) parsed.hook = '';
    if (!Array.isArray(parsed.hashtags)) parsed.hashtags = [];
    if (!parsed.cta) parsed.cta = '';
    if (!Array.isArray(parsed.alternativeVersions)) parsed.alternativeVersions = [];

    return res.status(200).json({
      success: true,
      influencer: {
        platform: selectedPlatform,
        tone: selectedTone,
        mainContent: parsed.mainContent,
        hook: parsed.hook,
        hashtags: parsed.hashtags,
        cta: parsed.cta,
        alternativeVersions: parsed.alternativeVersions,
        suggestedVisual: parsed.suggestedVisual || '',
        bestTimeToPost: parsed.bestTimeToPost || '',
        estimatedEngagement: parsed.estimatedEngagement || ''
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

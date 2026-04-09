export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { listing } = req.body;
    if (!listing) return res.status(400).json({ error: 'listing object is required' });

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI API key not configured' });

    const productInfo = `
Titulos: ${(listing.titles || []).join(' | ')}
Descricao: ${listing.description || ''}
Keywords: ${listing.keywords || ''}
Preco: ${listing.priceRange || ''}
Marca: ${listing.attributes?.brand || 'Generica'}
Cor: ${listing.attributes?.color || ''}
Material: ${listing.attributes?.material || ''}
Condicao: ${listing.attributes?.condition || 'novo'}`.trim();

    const prompt = `Voce e um diretor de video marketing especializado em anuncios para marketplaces brasileiros.

PRODUTO:
${productInfo}

Crie um roteiro de video comercial curto (20-30 segundos) para este produto, otimizado para Reels/TikTok/Stories.

REGRAS:
- Exatamente 6 cenas
- Cada cena: 3-5 segundos
- Texto overlay curto e impactante (maximo 8 palavras por cena)
- Narracao em portugues fluente e persuasivo
- Primeira cena: gancho de atencao
- Ultima cena: CTA (chamada para acao) com urgencia
- Inclua preco se disponivel
- Tom: profissional mas acessivel

Responda APENAS JSON valido:
{
  "scenes": [
    {"id":1, "duration":3, "text":"Texto overlay curto", "narration":"Narracao em portugues", "animation":"fade-in", "textColor":"#FFFFFF", "bgGradient":["#1a1a2e","#16213e"]},
    {"id":2, "duration":4, "text":"...", "narration":"...", "animation":"slide-left", "textColor":"#FFFFFF", "bgGradient":["#0f3460","#533483"]},
    {"id":3, "duration":4, "text":"...", "narration":"...", "animation":"zoom-in", "textColor":"#FFD700", "bgGradient":["#1a1a2e","#e94560"]},
    {"id":4, "duration":4, "text":"...", "narration":"...", "animation":"slide-right", "textColor":"#FFFFFF", "bgGradient":["#0f3460","#16213e"]},
    {"id":5, "duration":3, "text":"...", "narration":"...", "animation":"pop", "textColor":"#4ade80", "bgGradient":["#1a1a2e","#533483"]},
    {"id":6, "duration":4, "text":"CTA AQUI!", "narration":"...", "animation":"pulse", "textColor":"#FFD700", "bgGradient":["#e94560","#1a1a2e"]}
  ],
  "totalDuration": 22,
  "music": {"mood":"energetico", "bpm":128},
  "narrationFull":"Script completo da narracao..."
}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return res.status(500).json({ error: 'AI error', details: e.error?.message || 'Unknown' });
    }

    const ai = await r.json();
    const txt = ai.content?.[0]?.text;
    if (!txt) return res.status(500).json({ error: 'No AI response' });

    let parsed;
    try {
      const jsonMatch = txt.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return res.status(500).json({ error: 'Parse error', raw: txt });
    }

    // Normalize
    var scenes = parsed.scenes || [];
    if (scenes.length < 3) scenes = [
      {id:1,duration:3,text:"Confira!",narration:"Olha que produto incrivel!",animation:"fade-in",textColor:"#FFFFFF",bgGradient:["#1a1a2e","#16213e"]},
      {id:2,duration:4,text:"Qualidade",narration:"Qualidade premium para voce",animation:"slide-left",textColor:"#FFD700",bgGradient:["#0f3460","#533483"]},
      {id:3,duration:3,text:"Compre Agora!",narration:"Aproveite enquanto dura!",animation:"pulse",textColor:"#4ade80",bgGradient:["#e94560","#1a1a2e"]}
    ];

    return res.status(200).json({
      success: true,
      video: {
        scenes: scenes,
        totalDuration: parsed.totalDuration || scenes.reduce(function(s,sc){return s+sc.duration},0),
        music: parsed.music || { mood: 'energetico', bpm: 128 },
        narrationFull: parsed.narrationFull || ''
      }
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

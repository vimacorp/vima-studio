export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { imageBase64, marketplace } = req.body;
    if (!imageBase64 || !marketplace) return res.status(400).json({ error: 'Missing imageBase64 or marketplace' });
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI API key not configured' });
    const mi = {
      mercadolivre: 'Gere anuncio otimizado para Mercado Livre Brasil. Titulo max 60 chars, palavras-chave, sem emojis. Descricao detalhada com specs, checkmarks. Keywords 5-8 termos. Categoria adequada ML. Preco em R$.',
      amazon: 'Gere anuncio otimizado para Amazon Brasil. Titulo max 200 chars com marca/modelo/cor. Descricao bullet points profissional. Keywords 5-8 termos. Categoria Amazon. Preco em R$.',
      shopee: 'Gere anuncio otimizado para Shopee Brasil. Titulo max 120 chars com emojis estrategicos. Descricao visual com emojis, promocoes, frete. Keywords 5-8 termos. Categoria Shopee. Preco competitivo R$.',
      tiktokshop: 'Gere anuncio otimizado para TikTok Shop Brasil. Titulo max 100 chars, emojis chamativos, linguagem jovem. Descricao informal engajante com emojis, frete gratis. Keywords 5-8 trending. Preco promocional R$.'
    };
    const inst = mi[marketplace] || mi.mercadolivre;
    let mt = 'image/jpeg';
    if (imageBase64.startsWith('data:image/png')) mt = 'image/png';
    else if (imageBase64.startsWith('data:image/webp')) mt = 'image/webp';
    const b64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mt, data: b64 } }, { type: 'text', text: inst + ' Analise a foto cuidadosamente. Identifique produto, marca, cor, tamanho, material, estado. Responda APENAS JSON: {"title":"...","description":"...","keywords":"...","category":"...","priceRange":"R$..."}' }] }] })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(500).json({ error: 'AI error', details: e.error?.message || 'Unknown' }); }
    const ai = await r.json();
    const txt = ai.content?.[0]?.text;
    if (!txt) return res.status(500).json({ error: 'No AI response' });
    let p;
    try { p = JSON.parse(txt.replace(/```json\n?/g,'').replace(/```/g,'').trim()); }
    catch(e) { return res.status(500).json({ error: 'Parse error', raw: txt }); }
    return res.status(200).json({ success: true, listing: { title: p.title||'', description: p.description||'', keywords: p.keywords||'', category: p.category||'', priceRange: p.priceRange||p.price_range||'' } });
  } catch (error) { return res.status(500).json({ error: 'Server error', message: error.message }); }
}
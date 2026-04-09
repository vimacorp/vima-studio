var SYSTEM_PROMPT = 'Voce e um expert em criacao de scripts para videos comerciais de produtos em marketplaces brasileiros. Seu trabalho e gerar scripts estruturados para videos verticais de 30 segundos que sao altamente persuasivos e seguem uma estrutura de vendas comprovada. Voce DEVE retornar APENAS um JSON valido, sem explicacoes adicionais. A estrutura deve ter exatamente 6 cenas seguindo esta ordem: 1-Hook (gancho de atencao), 2-Benefit (principal beneficio), 3-Feature (funcionalidade destaque), 4-Social Proof (confianca), 5-Urgency (urgencia), 6-CTA (call-to-action). Cada cena DEVE ter: text (max 6 palavras impactantes), subtext (uma frase de suporte), duration (4-6 segundos), layout (um de: product-center, product-left-text-right, product-right-text-left, zoom-product, split-before-after, fullscreen-text), animation (um de: fade-in, zoom-in, slide-left, slide-right, pulse, reveal), bgColor (gradiente CSS profissional ex: linear-gradient(135deg, #1a1a2e, #16213e)), textColor (cor hex), category (um de: hook, benefit, feature, social-proof, urgency, cta). Use cores escuras e profissionais nos gradientes. O texto deve ser em portugues brasileiro, persuasivo e direto. A soma das duracoes deve dar aproximadamente 30 segundos.';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var body = req.body;
    var title = body.title || 'Produto';
    var marketplace = body.marketplace || 'Mercado Livre';

    console.log('[Video] Generating script for: ' + title + ' on ' + marketplace);

    var userPrompt = 'Gere um script de video comercial vertical de 30 segundos para este produto:\n\n' +
      'Titulo: ' + title + '\n' +
      'Marketplace: ' + marketplace + '\n\n' +
      'IMPORTANTE: O video mostrara a foto REAL do produto em TODAS as cenas. O frontend vai renderizar a imagem do produto no layout especificado. Entao os textos devem complementar a imagem, nao descreve-la.\n\n' +
      'Retorne APENAS o JSON com esta estrutura:\n' +
      '{\n' +
      '  "scenes": [\n' +
      '    {\n' +
      '      "text": "string (max 6 palavras)",\n' +
      '      "subtext": "string (uma frase)",\n' +
      '      "duration": number,\n' +
      '      "layout": "string",\n' +
      '      "animation": "string",\n' +
      '      "bgColor": "string (CSS gradient)",\n' +
      '      "textColor": "string (hex)",\n' +
      '      "category": "string"\n' +
      '    }\n' +
      '  ],\n' +
      '  "narration": "string (script completo de narracao em portugues)"\n' +
      '}';

    var apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!apiResponse.ok) {
      var errText = await apiResponse.text();
      console.log('[Video] Claude API error: ' + apiResponse.status + ' - ' + errText.substring(0, 200));
      throw new Error('Claude API ' + apiResponse.status);
    }

    var data = await apiResponse.json();
    var responseText = data.content && data.content[0] && data.content[0].text ? data.content[0].text : '';

    console.log('[Video] Claude response length: ' + responseText.length);

    // Extract JSON from response
    var jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Claude response');

    var scriptData = JSON.parse(jsonMatch[0]);

    if (!scriptData.scenes || !Array.isArray(scriptData.scenes)) {
      throw new Error('Invalid scenes structure');
    }

    // Ensure exactly 6 scenes
    var scenes = scriptData.scenes.slice(0, 6);

    // Calculate total duration
    var totalDuration = 0;
    for (var i = 0; i < scenes.length; i++) {
      totalDuration += scenes[i].duration || 5;
    }

    console.log('[Video] Generated ' + scenes.length + ' scenes, total ' + totalDuration + 's');

    return res.status(200).json({
      success: true,
      video: {
        scenes: scenes,
        narration: scriptData.narration || '',
        totalDuration: totalDuration,
        format: 'vertical',
        resolution: '1080x1920'
      }
    });

  } catch (err) {
    console.log('[Video] Error: ' + err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// api/build-creative-brief.js
// Camada de raciocinio visual do VIMA Studio.
// Usa Claude Sonnet 4 com visao multimodal para analisar a foto do produto
// + o briefing textual e produzir um BRIEF CRIATIVO estruturado.
// Este brief alimenta depois o generate-carrossel.js.
//
// 100% DINAMICO. Zero hardcode de produto, nicho ou copy.
// Todo o conteudo visual e textual e decidido pelo modelo, por requisicao.

export const config = { maxDuration: 120 };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = [
    'Voce e um diretor criativo senior especializado em anuncios de marketplace brasileiro',
    '(Mercado Livre, Shopee, Amazon, Magalu, TikTok Shop). Sua funcao e analisar UMA foto de',
    'produto + um briefing textual e produzir um BRIEF CRIATIVO estruturado para um carrossel',
    'de 6 pecas de neuromarketing.',
    '',
    'REGRAS OBRIGATORIAS:',
    '',
    '1. VOCE OLHA A IMAGEM DE VERDADE. Nao invente. Descreva apenas o que realmente aparece:',
    '   formato, material, cor, proporcao, elementos distintivos, estilo, acabamento. Se algo',
    '   nao estiver claro na foto, marque "nao visivel" naquele campo.',
    '',
    '2. CADA BRIEF E UNICO PARA O PRODUTO QUE VOCE ESTA VENDO. Proibido usar frases genericas',
    '   de copywriter tipo "VOCE AINDA NAO TEM ISSO", "MAIS VENDIDO", "FUNCIONA DE VERDADE",',
    '   "ULTIMAS UNIDADES", "+10 MIL CLIENTES". Toda copy precisa derivar de algo concreto',
    '   deste produto: uma dimensao real, um material real, um contraste visual real, um uso',
    '   real, uma comparacao real. Se voce nao consegue justificar a frase olhando a foto ou',
    '   o briefing, a frase e generica e nao pode entrar.',
    '',
    '3. FLUXO DE DECISAO DE COMPRA. Os 6 angulos devem formar um fluxo logico:',
    '   (1) parar o scroll, (2) apresentar o produto, (3) mostrar dimensao/detalhe real,',
    '   (4) uso no cotidiano, (5) prova ou comparacao, (6) chamada para acao.',
    '   Cada angulo tem um papel diferente no funil.',
    '',
    '4. OS PROMPTS VISUAIS NAO PEDEM TEXTO. Os campos cena_visual sao prompts em INGLES para',
    '   um modelo text-to-image (Flux Kontext Pro). Voce NAO pede para o modelo renderizar',
    '   texto dentro da imagem. Texto sera composto por cima no servidor. Os prompts devem:',
    '   - ser faithful ao produto que voce realmente viu (mesma cor, forma, material);',
    '   - descrever ambiente, angulo de camera, iluminacao, contexto de uso, estilo fotografico;',
    '   - terminar com "no text, no letters, no watermarks, photorealistic, 4k";',
    '   - apenas o angulo 2 (apresentacao_produto) pode usar fundo branco de estudio;',
    '     todos os outros devem estar em ambiente contextual real.',
    '',
    '5. COPY EM PT-BR, CURTA, ESPECIFICA. Cada copy_overlay tem NO MAXIMO 6 palavras, em',
    '   CAIXA ALTA, e fala de algo concreto e verificavel deste produto. Nada de chavao.',
    '   O cta_overlay do angulo 6 tem NO MAXIMO 4 palavras.',
    '',
    '6. SAIDA SEMPRE EM JSON VALIDO. Sem markdown, sem crase tripla, sem comentarios, sem',
    '   texto antes ou depois. Apenas o objeto JSON abaixo, exatamente nesse formato:',
    '',
    '{',
    '  "analise_visual": {',
    '    "o_que_e": "string curta descrevendo o objeto",',
    '    "formato": "string",',
    '    "material_aparente": "string",',
    '    "cores": ["string"],',
    '    "elementos_distintivos": ["string"],',
    '    "estilo": "string",',
    '    "proporcao_estimada": "string ou nao visivel"',
    '  },',
    '  "publico_real": "string - quem efetivamente compra ESTE produto, refinado a partir da foto",',
    '  "dor_especifica": "string - a dor concreta que ESTE produto resolve",',
    '  "angulos_criativos": [',
    '    { "ordem": 1, "papel_no_fluxo": "hook_parar_scroll",   "conceito": "...", "cena_visual": "...", "copy_overlay": "...", "cta_overlay": null },',
    '    { "ordem": 2, "papel_no_fluxo": "apresentacao_produto","conceito": "...", "cena_visual": "...", "copy_overlay": "...", "cta_overlay": null },',
    '    { "ordem": 3, "papel_no_fluxo": "dimensao_ou_detalhe", "conceito": "...", "cena_visual": "...", "copy_overlay": "...", "cta_overlay": null },',
    '    { "ordem": 4, "papel_no_fluxo": "uso_no_cotidiano",    "conceito": "...", "cena_visual": "...", "copy_overlay": "...", "cta_overlay": null },',
    '    { "ordem": 5, "papel_no_fluxo": "prova_ou_comparacao", "conceito": "...", "cena_visual": "...", "copy_overlay": "...", "cta_overlay": null },',
    '    { "ordem": 6, "papel_no_fluxo": "cta_acao",            "conceito": "...", "cena_visual": "...", "copy_overlay": "...", "cta_overlay": "..." }',
    '  ]',
    '}'
].join('\n');

function buildUserMessage(listing, descricaoTecnica) {
    const parts = [];
    parts.push('BRIEFING DO PRODUTO:');
    if (listing && typeof listing === 'object') {
        if (listing.titulo || listing.title) parts.push('Titulo: ' + String(listing.titulo || listing.title));
        if (listing.descricao) parts.push('Descricao: ' + String(listing.descricao).substring(0, 800));
        if (Array.isArray(listing.beneficios) && listing.beneficios.length) {
            parts.push('Beneficios: ' + listing.beneficios.slice(0, 6).map(String).join(' | '));
        } else if (Array.isArray(listing.bullets) && listing.bullets.length) {
            parts.push('Bullets: ' + listing.bullets.slice(0, 6).map(String).join(' | '));
        }
        if (listing.publico_alvo || listing.publico) parts.push('Publico (briefing): ' + String(listing.publico_alvo || listing.publico));
        if (listing.nicho) parts.push('Nicho: ' + String(listing.nicho));
        if (listing.categoria) parts.push('Categoria: ' + String(listing.categoria));
        if (listing.dor || listing.dores) parts.push('Dor (briefing): ' + String(listing.dor || listing.dores));
    }
    if (descricaoTecnica && String(descricaoTecnica).trim()) {
        parts.push('');
        parts.push('DESCRICAO TECNICA FORNECIDA PELO VENDEDOR:');
        parts.push(String(descricaoTecnica).trim().substring(0, 1200));
    }
    parts.push('');
    parts.push('Analise a imagem anexa e produza o brief criativo em JSON, seguindo EXATAMENTE o formato especificado no system. Nada alem do JSON.');
    return parts.join('\n');
}

function extractJson(text) {
    if (!text) return null;
    let t = String(text).trim();
    t = t.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '');
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first >= 0 && last > first) {
        const candidate = t.substring(first, last + 1);
        try { return JSON.parse(candidate); } catch (e) { /* fallthrough */ }
    }
    try { return JSON.parse(t); } catch (e) { return null; }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        if (!ANTHROPIC_API_KEY) {
            return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
        }
        const { imageBase64, listing, descricaoTecnica } = req.body || {};
        if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
        if (!listing)     return res.status(400).json({ error: 'listing required' });

        const m = String(imageBase64).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/);
        const mediaType = m ? m[1] : 'image/jpeg';
        const rawB64    = m ? m[2] : imageBase64;

        const userText = buildUserMessage(listing, descricaoTecnica);

        const body = {
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: { type: 'base64', media_type: mediaType, data: rawB64 }
                        },
                        { type: 'text', text: userText }
                    ]
                }
            ]
        };

        const r = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: {
                'Content-Type':     'application/json',
                'x-api-key':        ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body)
        });

        if (!r.ok) {
            const errText = await r.text();
            console.error('anthropic error', r.status, errText);
            return res.status(502).json({
                error: 'anthropic_failed',
                status: r.status,
                detail: errText.substring(0, 500)
            });
        }

        const data = await r.json();
        const rawText = data && data.content && data.content[0] && data.content[0].text;
        const brief = extractJson(rawText);

        if (!brief || !Array.isArray(brief.angulos_criativos) || brief.angulos_criativos.length !== 6) {
            return res.status(502).json({
                error: 'brief_invalid',
                raw: rawText ? String(rawText).substring(0, 1200) : null
            });
        }

        return res.status(200).json({ brief: brief });
    } catch (e) {
        console.error('build-creative-brief error', e);
        return res.status(500).json({ error: String(e && e.message || e) });
    }
}

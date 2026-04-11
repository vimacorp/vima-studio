// api/generate-carrossel.js
// Gera carrossel de CRIATIVOS (artes) de marketplace com neuromarketing aplicado.
// Usa Freepik Flux Kontext Pro (text-to-image com renderizacao de texto em PT-BR).
// Cada cena tem: contexto visual detalhado + overlay de texto (hook/CTA/beneficio).
// Apenas 1 cena tem fundo branco puro (a cena "produto_limpo"). As demais sao
// ambientadas em cenarios reais de uso.

export const config = { maxDuration: 300 };

const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;
const FREEPIK_ENDPOINT = 'https://api.freepik.com/v1/ai/text-to-image/flux-kontext-pro';

const MARKETPLACE_ASPECT = {
    mercado_livre: 'square_1_1',
    amazon:        'square_1_1',
    shopee:        'square_1_1',
    magalu:        'square_1_1',
    shein:         'square_1_1',
    tiktok_shop:   'traditional_3_4',
    instagram:     'square_1_1',
    default:       'square_1_1'
};

// ---------- helpers ----------
function clean(str, max) {
    if (!str) return '';
    var s = String(str).replace(/\s+/g, ' ').trim();
    return max ? s.substring(0, max) : s;
}

function shortTitle(listing) {
    var t = clean(listing && (listing.titulo || listing.title || listing.produto), 60);
    return t || 'produto';
}

function topBenefits(listing, n) {
    var arr = [];
    if (listing && Array.isArray(listing.beneficios)) arr = listing.beneficios;
    else if (listing && Array.isArray(listing.bullets)) arr = listing.bullets;
    else if (listing && Array.isArray(listing.features)) arr = listing.features;
    else if (listing && typeof listing.descricao === 'string') {
        arr = listing.descricao.split(/[.;\n]/).filter(function(s){return s.trim().length>8;});
    }
    return arr.slice(0, n || 3).map(function(b){return clean(b, 80);});
}

// ---------- PROMPT BUILDER ----------
// Monta o roteiro de 6 cenas com neuromarketing + texto renderizado.
function buildRoadmap(listing, marketplace) {
    const aspect = MARKETPLACE_ASPECT[marketplace] || MARKETPLACE_ASPECT.default;
    const produto = shortTitle(listing);
    const benefs = topBenefits(listing, 3);
    const b1 = benefs[0] || 'qualidade premium';
    const b2 = benefs[1] || 'facil de usar';
    const b3 = benefs[2] || 'resultado rapido';

    // PT-BR texto que sera RENDERIZADO dentro da imagem pelo Flux Kontext Pro.
    // Flux Kontext renderiza texto curto com alta fidelidade quando instruido
    // explicitamente com "render the EXACT text" e aspas.

    return [
        // 1. HOOK - pergunta que para o scroll (padrao-interrupcao)
        {
            idx: 0,
            role: 'hook',
            label: 'Hook (parar o scroll)',
            aspect: aspect,
            prompt:
                'High-end lifestyle product advertising photography, square composition. ' +
                'A person in a modern Brazilian home or office environment looking frustrated/curious, ' +
                'with the product "' + produto + '" visible on the side. ' +
                'Cinematic warm lighting, shallow depth of field, 4k, photorealistic. ' +
                'STRICTLY NO WHITE STUDIO BACKGROUND - must be a real contextual scene. ' +
                'IMPORTANT: render the EXACT Portuguese text "VOCE AINDA NAO TEM ISSO?" ' +
                'as a BOLD YELLOW sans-serif headline at the top of the image, clearly legible, ' +
                'with a small subtitle "(Olha o que ta bombando)" below it in white. ' +
                'Text must be perfectly spelled, no gibberish letters.'
        },

        // 2. PRODUTO LIMPO - unica cena com fundo branco (foto de catalogo + badge)
        {
            idx: 1,
            role: 'produto_limpo',
            label: 'Produto em destaque',
            aspect: aspect,
            prompt:
                'Professional e-commerce catalog photo of "' + produto + '" on a pure white seamless background, ' +
                'soft shadow, studio lighting, ultra detailed, centered, 4k, square composition. ' +
                'IMPORTANT: render the EXACT Portuguese text "MAIS VENDIDO" as a red rounded badge ' +
                'in the top-right corner, and "FRETE GRATIS" as a small green tag in the bottom-left. ' +
                'All text perfectly legible, no gibberish.'
        },

        // 3. EM USO - prova visual (espelho-neural, "eu me vejo usando")
        {
            idx: 2,
            role: 'em_uso',
            label: 'Produto em uso',
            aspect: aspect,
            prompt:
                'Candid lifestyle photography: a Brazilian person actively using "' + produto + '" ' +
                'in a real home/kitchen/office environment, authentic moment, warm natural light, ' +
                'shallow depth of field, photorealistic, 4k, square composition. ' +
                'STRICTLY NO WHITE STUDIO BACKGROUND - must be an ambient real-world scene. ' +
                'IMPORTANT: render the EXACT Portuguese text "FUNCIONA DE VERDADE" as a bold white headline ' +
                'with black outline at the bottom of the image, perfectly legible, no gibberish.'
        },

        // 4. BENEFICIO PRINCIPAL - ganho concreto (padrao-recompensa)
        {
            idx: 3,
            role: 'beneficio',
            label: 'Beneficio principal',
            aspect: aspect,
            prompt:
                'Macro close-up lifestyle shot showing the key benefit of "' + produto + '" in action, ' +
                'detailed texture, premium feel, cinematic lighting, ambient contextual background ' +
                '(NOT white studio), photorealistic, 4k, square. ' +
                'IMPORTANT: render the EXACT Portuguese text "' + clean(b1, 40).toUpperCase() + '" ' +
                'as a large bold white headline with a semi-transparent black bar behind it, centered, ' +
                'perfectly legible, no gibberish.'
        },

        // 5. PROVA SOCIAL - numeros + estrelas (padrao-manada)
        {
            idx: 4,
            role: 'prova_social',
            label: 'Prova social',
            aspect: aspect,
            prompt:
                'Lifestyle photograph of "' + produto + '" on a warm wooden table with a coffee cup ' +
                'and a smartphone showing a 5-star review, cozy ambient Brazilian home background ' +
                '(NOT white studio), warm light, bokeh, photorealistic, 4k, square composition. ' +
                'IMPORTANT: render the EXACT Portuguese text "+10 MIL CLIENTES SATISFEITOS" ' +
                'as a bold white headline at the top, and below it render FIVE YELLOW STARS followed by ' +
                '"4,9/5" in white. All text perfectly spelled, no gibberish.'
        },

        // 6. CTA - escassez + acao (padrao-urgencia)
        {
            idx: 5,
            role: 'cta',
            label: 'Chamada para acao',
            aspect: aspect,
            prompt:
                'Dramatic product hero shot of "' + produto + '" on a dark gradient ambient background ' +
                '(dark blue to black, NOT white), rim lighting, cinematic, premium advertising style, ' +
                'photorealistic, 4k, square composition. ' +
                'IMPORTANT: render the EXACT Portuguese text "ULTIMAS UNIDADES" as a bold red headline ' +
                'at the top, and a big yellow rounded button at the bottom with the EXACT text ' +
                '"QUERO O MEU AGORA" in bold black letters inside the button. ' +
                'All text perfectly spelled, centered, no gibberish.'
        }
    ];
}

// ---------- upload helper ----------
// Flux Kontext Pro exige `input_image` como URL publica, nao aceita base64.
// Uploadamos o base64 do usuario para tmpfiles.org para obter uma URL temporaria.
async function uploadBase64ToUrl(imageBase64) {
    try {
        if (!imageBase64 || typeof imageBase64 !== 'string') return null;
        const m = imageBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/);
        const mime = m ? m[1] : 'image/jpeg';
        const b64 = m ? m[2] : imageBase64;
        const buffer = Buffer.from(b64, 'base64');
        const form = new FormData();
        form.append('file', new Blob([buffer], { type: mime }), 'product.jpg');
        const r = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: form });
        const json = await r.json();
        const url = json && json.data && json.data.url;
        if (!url) return null;
        // tmpfiles.org retorna URL de pagina; o download direto usa /dl/
        return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    } catch (e) {
        console.error('upload failed:', e && e.message);
        return null;
    }
}

// ---------- Freepik call ----------
async function generateScene(scene, inputImageUrl) {
    const body = {
        prompt: scene.prompt,
        aspect_ratio: scene.aspect
    };
    // Flux Kontext Pro usa input_image (URL) para preservar o produto
    if (inputImageUrl) body.input_image = inputImageUrl;

    const createResp = await fetch(FREEPIK_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-freepik-api-key': FREEPIK_API_KEY
        },
        body: JSON.stringify(body)
    });

    if (!createResp.ok) {
        const err = await createResp.text();
        throw new Error('Freepik create ' + createResp.status + ': ' + err.substring(0, 200));
    }

    const created = await createResp.json();
    const taskId = created && created.data && created.data.task_id;
    if (!taskId) throw new Error('Freepik: missing task_id');

    // Poll
    const pollUrl = FREEPIK_ENDPOINT + '/' + taskId;
    const maxTries = 40;
    for (let i = 0; i < maxTries; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const p = await fetch(pollUrl, { headers: { 'x-freepik-api-key': FREEPIK_API_KEY } });
        if (!p.ok) continue;
        const pj = await p.json();
        const status = pj && pj.data && pj.data.status;
        if (status === 'COMPLETED') {
            const generated = pj.data.generated || [];
            const url = generated[0] && (generated[0].url || generated[0]);
            if (url) {
                return {
                    idx: scene.idx,
                    role: scene.role,
                    label: scene.label,
                    imageUrl: typeof url === 'string' ? url : (url.url || ''),
                    prompt: scene.prompt
                };
            }
            throw new Error('Freepik: completed but no url');
        }
        if (status === 'FAILED') throw new Error('Freepik: task failed');
    }
    throw new Error('Freepik: poll timeout');
}

// ---------- handler ----------
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        if (!FREEPIK_API_KEY) {
            return res.status(500).json({ error: 'FREEPIK_API_KEY not configured' });
        }
        const { imageBase64, listing, marketplace } = req.body || {};
        if (!listing) return res.status(400).json({ error: 'listing required' });

        const roadmap = buildRoadmap(listing, marketplace || 'default');

        // Faz upload do base64 do usuario para gerar URL publica (Flux exige URL)
        const inputImageUrl = await uploadBase64ToUrl(imageBase64);

        // Roda as 6 cenas em paralelo, tolerando falhas individuais
        const results = await Promise.allSettled(
            roadmap.map(function (s) { return generateScene(s, inputImageUrl); })
        );

        const scenes = [];
        const errors = [];
        results.forEach(function (r, i) {
            if (r.status === 'fulfilled') {
                scenes.push(r.value);
            } else {
                errors.push({ idx: roadmap[i].idx, role: roadmap[i].role, error: String(r.reason).substring(0, 200) });
            }
        });

        if (!scenes.length) {
            return res.status(502).json({ error: 'All scenes failed', errors: errors });
        }

        scenes.sort(function (a, b) { return a.idx - b.idx; });
        return res.status(200).json({
            scenes: scenes,
            total: scenes.length,
            failed: errors.length,
            errors: errors
        });
    } catch (e) {
        console.error('generate-carrossel error', e);
        return res.status(500).json({ error: String(e && e.message || e) });
    }
}

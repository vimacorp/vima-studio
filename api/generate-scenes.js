var SCENES = [
  {
    name: "Sala de Estar",
    key: "living-room",
    prompt: "Professional product photography in a cozy modern living room with warm natural light, wooden shelves, plants, soft neutral tones"
  },
  {
    name: "Cozinha",
    key: "kitchen",
    prompt: "Professional product photography in a bright modern kitchen with marble countertop, natural daylight from large window, clean aesthetic"
  },
  {
    name: "Escritório",
    key: "office",
    prompt: "Professional product photography in a minimalist home office with wooden desk, warm ambient light, organized workspace"
  },
  {
    name: "Quarto",
    key: "bedroom",
    prompt: "Professional product photography in an elegant bedroom with soft bedding, warm lamp light, cozy atmosphere"
  },
  {
    name: "Ambiente Externo",
    key: "outdoor",
    prompt: "Professional product photography in a beautiful outdoor garden terrace with natural sunlight, green plants, fresh atmosphere"
  },
  {
    name: "Estúdio Fotográfico",
    key: "studio",
    prompt: "Professional product photography in a clean photography studio with soft diffused lighting, neutral gray backdrop, commercial quality"
  },
  {
    name: "Vitrine de Loja",
    key: "store",
    prompt: "Professional product photography in an upscale retail store display, elegant shelving, premium brand presentation, spotlights"
  },
  {
    name: "Minimalista",
    key: "minimalist",
    prompt: "Professional product photography on a clean white surface with soft shadows, minimalist aesthetic, e-commerce ready"
  }
];

function stripDataPrefix(imageBase64) {
  if (imageBase64.indexOf(",") > -1) {
    return imageBase64.split(",")[1];
  }
  return imageBase64;
}

function createSvgFallback(sceneKey, sceneLabel) {
  var colors = {
    "living-room": ["#d4a574", "#8b6f47"],
    "kitchen": ["#e8f4f8", "#b8d4e3"],
    "office": ["#c8b8a8", "#8b8680"],
    "bedroom": ["#e6d5e6", "#b8a5b8"],
    "outdoor": ["#87ceeb", "#90ee90"],
    "studio": ["#f0f0f0", "#c0c0c0"],
    "store": ["#f5e6cc", "#d4a574"],
    "minimalist": ["#ffffff", "#f0f0f0"]
  };
  var c = colors[sceneKey] || ["#e0e0e0", "#a0a0a0"];
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">' +
    '<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" style="stop-color:' + c[0] + '"/>' +
    '<stop offset="100%" style="stop-color:' + c[1] + '"/>' +
    '</linearGradient></defs>' +
    '<rect width="1024" height="1024" fill="url(#bg)"/>' +
    '<text x="512" y="950" text-anchor="middle" font-size="28" fill="rgba(0,0,0,0.4)" font-family="Arial">' + (sceneLabel || 'Cenário') + '</text>' +
    '</svg>';
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

async function generateScene(sceneData, imageBuffer) {
  var apiKey = process.env.PHOTOROOM_API_KEY;
  try {
    var blob = new Blob([imageBuffer], { type: 'image/png' });
    var formData = new FormData();
    formData.append('imageFile', blob, 'product.png');
    formData.append('background.prompt', sceneData.prompt);
    formData.append('referenceBox', 'originalImage');

    console.log('[Scenes] Calling Photoroom for: ' + sceneData.key);

    var response = await fetch('https://image-api.photoroom.com/v2/edit', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey
      },
      body: formData
    });

    if (!response.ok) {
      var errText = await response.text();
      console.log('[Scenes] Photoroom failed for ' + sceneData.key + ': ' + response.status + ' - ' + errText.substring(0, 200));
      return {
        name: sceneData.name,
        key: sceneData.key,
        image: createSvgFallback(sceneData.key, sceneData.name),
        provider: 'fallback'
      };
    }

    var arrayBuffer = await response.arrayBuffer();
    var base64 = Buffer.from(arrayBuffer).toString('base64');
    var contentType = response.headers.get('content-type') || 'image/png';
    console.log('[Scenes] SUCCESS for ' + sceneData.key + ' (' + contentType + ', ' + Math.round(arrayBuffer.byteLength / 1024) + 'KB)');

    return {
      name: sceneData.name,
      key: sceneData.key,
      image: 'data:' + contentType + ';base64,' + base64,
      provider: 'photoroom'
    };
  } catch (err) {
    console.log('[Scenes] Error for ' + sceneData.key + ': ' + err.message);
    return {
      name: sceneData.name,
      key: sceneData.key,
      image: createSvgFallback(sceneData.key, sceneData.name),
      provider: 'fallback'
    };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var body = req.body;
    var imageBase64 = body.image;
    if (!imageBase64) return res.status(400).json({ error: 'Missing image' });

    imageBase64 = stripDataPrefix(imageBase64);
    var imageBuffer = Buffer.from(imageBase64, 'base64');

    console.log('[Scenes] Processing 8 scenes, Photoroom: ' + (!!process.env.PHOTOROOM_API_KEY));

    var results = await Promise.allSettled(
      SCENES.map(function(scene) { return generateScene(scene, imageBuffer); })
    );

    var scenes = results.map(function(r, i) {
      if (r.status === 'fulfilled') return r.value;
      console.log('[Scenes] Promise rejected for ' + SCENES[i].key + ': ' + r.reason);
      return {
        name: SCENES[i].name,
        key: SCENES[i].key,
        image: createSvgFallback(SCENES[i].key, SCENES[i].name),
        provider: 'fallback'
      };
    });

    var successCount = scenes.filter(function(s) { return s.provider === 'photoroom'; }).length;
    console.log('[Scenes] Done: ' + successCount + '/8 via Photoroom');

    return res.status(200).json({ success: true, scenes: scenes });
  } catch (err) {
    console.log('[Scenes] Fatal error: ' + err.message);
    return res.status(500).json({ error: err.message });
  }
}

var SCENES = [
  {
    name: "Sala de Estar",
    key: "living-room",
    prompt: "Professional product photography in a cozy modern living room with warm natural light, wooden shelves, plants, soft neutral tones, high quality commercial photo",
    photoroom_prompt: "Professional product photography in a cozy modern living room with warm natural light, wooden shelves, plants, soft neutral tones"
  },
  {
    name: "Cozinha",
    key: "kitchen",
    prompt: "Professional product photography in a bright modern kitchen with marble countertop, natural daylight from large window, clean aesthetic, high quality commercial photo",
    photoroom_prompt: "Professional product photography in a bright modern kitchen with marble countertop, natural daylight from large window, clean aesthetic"
  },
  {
    name: "Escritorio",
    key: "office",
    prompt: "Professional product photography in a minimalist home office with wooden desk, warm ambient light, organized workspace, high quality commercial photo",
    photoroom_prompt: "Professional product photography in a minimalist home office with wooden desk, warm ambient light, organized workspace"
  },
  {
    name: "Quarto",
    key: "bedroom",
    prompt: "Professional product photography in an elegant bedroom with soft bedding, warm lamp light, cozy atmosphere, high quality commercial photo",
    photoroom_prompt: "Professional product photography in an elegant bedroom with soft bedding, warm lamp light, cozy atmosphere"
  },
  {
    name: "Ambiente Externo",
    key: "outdoor",
    prompt: "Professional product photography in a beautiful outdoor garden terrace with natural sunlight, green plants, fresh atmosphere, high quality commercial photo",
    photoroom_prompt: "Professional product photography in a beautiful outdoor garden terrace with natural sunlight, green plants, fresh atmosphere"
  },
  {
    name: "Estudio Fotografico",
    key: "studio",
    prompt: "Professional product photography in a clean photography studio with soft diffused lighting, neutral gray backdrop, commercial quality, high quality photo",
    photoroom_prompt: "Professional product photography in a clean photography studio with soft diffused lighting, neutral gray backdrop, commercial quality"
  },
  {
    name: "Vitrine de Loja",
    key: "store",
    prompt: "Professional product photography in an upscale retail store display, elegant shelving, premium brand presentation, spotlights, high quality commercial photo",
    photoroom_prompt: "Professional product photography in an upscale retail store display, elegant shelving, premium brand presentation, spotlights"
  },
  {
    name: "Minimalista",
    key: "minimalist",
    prompt: "Professional product photography on a clean white surface with soft shadows, minimalist aesthetic, e-commerce ready, high quality commercial photo",
    photoroom_prompt: "Professional product photography on a clean white surface with soft shadows, minimalist aesthetic, e-commerce ready"
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
    '<text x="512" y="950" text-anchor="middle" font-size="28" fill="rgba(0,0,0,0.4)" font-family="Arial">' + (sceneLabel || 'Cenario') + '</text>' +
    '</svg>';
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// Freepik Mystic API - async task-based generation
async function generateWithFreepik(sceneData, imageBase64) {
  var apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) throw new Error('No Freepik API key');

  console.log('[Scenes] Freepik: Creating task for ' + sceneData.key);

  // Step 1: Create the generation task using Reimagine Flux
  var createResponse = await fetch('https://api.freepik.com/v1/ai/beta/text-to-image/reimagine-flux', {
    method: 'POST',
    headers: {
      'x-freepik-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image: imageBase64,
      prompt: sceneData.prompt,
      imagination: "low",
      aspect_ratio: "square_1_1"
    })
  });

  if (!createResponse.ok) {
    var errBody = await createResponse.text();
    console.log('[Scenes] Freepik Reimagine create failed: ' + createResponse.status + ' - ' + errBody.substring(0, 300));

    // Fallback to Mystic with structure_reference
    console.log('[Scenes] Trying Freepik Mystic for ' + sceneData.key);
    createResponse = await fetch('https://api.freepik.com/v1/ai/mystic', {
      method: 'POST',
      headers: {
        'x-freepik-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: sceneData.prompt,
        resolution: "2k",
        aspect_ratio: "square_1_1",
        model: "realism",
        structure_reference: imageBase64,
        structure_strength: 70,
        hdr: 50,
        creative_detailing: 50,
        filter_nsfw: true
      })
    });

    if (!createResponse.ok) {
      var errBody2 = await createResponse.text();
      console.log('[Scenes] Freepik Mystic create failed: ' + createResponse.status + ' - ' + errBody2.substring(0, 300));
      throw new Error('Freepik API failed: ' + createResponse.status);
    }
  }

  var taskData = await createResponse.json();
  console.log('[Scenes] Freepik task created for ' + sceneData.key + ': ' + JSON.stringify(taskData).substring(0, 200));

  // Check if response already contains the image (some endpoints are sync)
  if (taskData.data && taskData.data.generated && taskData.data.generated.length > 0) {
    var imageUrl = taskData.data.generated[0];
    console.log('[Scenes] Freepik immediate result for ' + sceneData.key);
    return await downloadImageAsBase64(imageUrl);
  }

  // Step 2: Poll for task completion
  var taskId = taskData.data && taskData.data.task_id;
  if (!taskId) {
    // Try alternative response formats
    taskId = taskData.task_id || (taskData.data && taskData.data.id);
    if (!taskId) throw new Error('No task ID in Freepik response');
  }

  var maxPolls = 25; // ~50 seconds max
  var pollInterval = 2000;

  for (var i = 0; i < maxPolls; i++) {
    await sleep(pollInterval);

    var statusResponse = await fetch('https://api.freepik.com/v1/ai/mystic/' + taskId, {
      method: 'GET',
      headers: {
        'x-freepik-api-key': apiKey
      }
    });

    if (!statusResponse.ok) {
      console.log('[Scenes] Freepik poll error for ' + sceneData.key + ': ' + statusResponse.status);
      continue;
    }

    var statusData = await statusResponse.json();
    var status = statusData.data && statusData.data.status;

    if (status === 'COMPLETED') {
      var images = statusData.data.generated;
      if (images && images.length > 0) {
        console.log('[Scenes] Freepik COMPLETED for ' + sceneData.key + ' after ' + ((i + 1) * 2) + 's');
        return await downloadImageAsBase64(images[0]);
      }
      throw new Error('Freepik completed but no images');
    }

    if (status === 'FAILED') {
      throw new Error('Freepik task failed for ' + sceneData.key);
    }

    // Still IN_PROGRESS or CREATED, continue polling
    if (i % 5 === 4) {
      console.log('[Scenes] Freepik still processing ' + sceneData.key + ' (' + status + ') after ' + ((i + 1) * 2) + 's');
    }
  }

  throw new Error('Freepik timeout for ' + sceneData.key);
}

async function downloadImageAsBase64(url) {
  var response = await fetch(url);
  if (!response.ok) throw new Error('Failed to download image: ' + response.status);
  var arrayBuffer = await response.arrayBuffer();
  var base64 = Buffer.from(arrayBuffer).toString('base64');
  var contentType = response.headers.get('content-type') || 'image/png';
  return 'data:' + contentType + ';base64,' + base64;
}

// Photoroom API - synchronous
async function generateWithPhotoroom(sceneData, imageBuffer) {
  var apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) throw new Error('No Photoroom API key');

  var blob = new Blob([imageBuffer], { type: 'image/png' });
  var formData = new FormData();
  formData.append('imageFile', blob, 'product.png');
  formData.append('background.prompt', sceneData.photoroom_prompt || sceneData.prompt);
  formData.append('referenceBox', 'originalImage');

  console.log('[Scenes] Photoroom: Calling for ' + sceneData.key);

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
    throw new Error('Photoroom ' + response.status);
  }

  var arrayBuffer = await response.arrayBuffer();
  var base64 = Buffer.from(arrayBuffer).toString('base64');
  var contentType = response.headers.get('content-type') || 'image/png';
  console.log('[Scenes] Photoroom SUCCESS for ' + sceneData.key + ' (' + Math.round(arrayBuffer.byteLength / 1024) + 'KB)');

  return 'data:' + contentType + ';base64,' + base64;
}

async function generateScene(sceneData, imageBuffer, imageBase64) {
  try {
    // Try Freepik first (Photoroom is out of credits)
    var image = await generateWithFreepik(sceneData, imageBase64);
    return {
      name: sceneData.name,
      key: sceneData.key,
      image: image,
      provider: 'freepik'
    };
  } catch (freepikErr) {
    console.log('[Scenes] Freepik failed for ' + sceneData.key + ': ' + freepikErr.message);

    // Fallback to Photoroom
    try {
      var image2 = await generateWithPhotoroom(sceneData, imageBuffer);
      return {
        name: sceneData.name,
        key: sceneData.key,
        image: image2,
        provider: 'photoroom'
      };
    } catch (photoroomErr) {
      console.log('[Scenes] Photoroom also failed for ' + sceneData.key + ': ' + photoroomErr.message);
      return {
        name: sceneData.name,
        key: sceneData.key,
        image: createSvgFallback(sceneData.key, sceneData.name),
        provider: 'fallback'
      };
    }
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

    var cleanBase64 = stripDataPrefix(imageBase64);
    var imageBuffer = Buffer.from(cleanBase64, 'base64');

    var hasFreepik = !!process.env.FREEPIK_API_KEY;
    var hasPhotoroom = !!process.env.PHOTOROOM_API_KEY;
    console.log('[Scenes] Processing 8 scenes. Freepik: ' + hasFreepik + ', Photoroom: ' + hasPhotoroom);

    var results = await Promise.allSettled(
      SCENES.map(function(scene) { return generateScene(scene, imageBuffer, cleanBase64); })
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

    var freepikCount = scenes.filter(function(s) { return s.provider === 'freepik'; }).length;
    var photoroomCount = scenes.filter(function(s) { return s.provider === 'photoroom'; }).length;
    console.log('[Scenes] Done: ' + freepikCount + '/8 Freepik, ' + photoroomCount + '/8 Photoroom');

    return res.status(200).json({ success: true, scenes: scenes });
  } catch (err) {
    console.log('[Scenes] Fatal error: ' + err.message);
    return res.status(500).json({ error: err.message });
  }
}

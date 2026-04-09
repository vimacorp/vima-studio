import sharp from 'sharp';

export const config = { maxDuration: 120 };

var SCENES = [
  { id: 'living-room', name: 'Sala de Estar', prompt: 'modern living room warm lighting wooden furniture cozy interior design', bg: { r: 245, g: 235, b: 220 }, accent: { r: 180, g: 140, b: 100 } },
  { id: 'kitchen', name: 'Cozinha', prompt: 'modern kitchen countertop marble surface bright clean kitchen natural light', bg: { r: 240, g: 245, b: 245 }, accent: { r: 160, g: 180, b: 170 } },
  { id: 'office', name: 'Escritorio', prompt: 'professional office desk modern workspace clean organized desk', bg: { r: 235, g: 235, b: 240 }, accent: { r: 100, g: 120, b: 150 } },
  { id: 'bedroom', name: 'Quarto', prompt: 'elegant bedroom soft bedding warm ambient lighting peaceful', bg: { r: 248, g: 240, b: 245 }, accent: { r: 180, g: 160, b: 175 } },
  { id: 'outdoor', name: 'Ambiente Externo', prompt: 'outdoor garden patio natural greenery sunlit terrace fresh', bg: { r: 230, g: 245, b: 230 }, accent: { r: 120, g: 160, b: 120 } },
  { id: 'studio', name: 'Estudio Fotografico', prompt: 'professional photo studio clean white backdrop studio lighting product photography', bg: { r: 250, g: 250, b: 250 }, accent: { r: 200, g: 200, b: 200 } },
  { id: 'store', name: 'Vitrine de Loja', prompt: 'luxury store display elegant retail shelf boutique shop interior premium', bg: { r: 255, g: 248, b: 235 }, accent: { r: 200, g: 170, b: 120 } },
  { id: 'minimalist', name: 'Minimalista', prompt: 'minimalist white surface clean scandinavian design soft shadow elegant simplicity', bg: { r: 245, g: 245, b: 245 }, accent: { r: 220, g: 220, b: 220 } }
];

async function generateWithPhotoroom(imageBuffer, prompt) {
  var apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) throw new Error('No Photoroom API key');

  var blob = new Blob([imageBuffer], { type: 'image/png' });
  var formData = new FormData();
  formData.append('image_file', blob, 'image.png');
  formData.append('prompt', prompt);

  var response = await fetch('https://sdk.photoroom.com/v1/instant-backgrounds', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: formData
  });

  if (!response.ok) {
    var err = await response.text();
    throw new Error('Photoroom ' + response.status + ': ' + err);
  }

  var arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateWithSharp(imageBuffer, scene, width, height) {
  var bg = scene.bg;
  var ac = scene.accent;

  var svgBg = '<svg width="' + width + '" height="' + height + '">' +
    '<defs>' +
    '<radialGradient id="g1" cx="50%" cy="30%" r="80%">' +
    '<stop offset="0%" stop-color="rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')"/>' +
    '<stop offset="100%" stop-color="rgb(' + Math.max(0, bg.r - 30) + ',' + Math.max(0, bg.g - 30) + ',' + Math.max(0, bg.b - 30) + ')"/>' +
    '</radialGradient>' +
    '<linearGradient id="floor" x1="0" y1="0.6" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="rgb(' + ac.r + ',' + ac.g + ',' + ac.b + ')" stop-opacity="0.15"/>' +
    '<stop offset="100%" stop-color="rgb(' + ac.r + ',' + ac.g + ',' + ac.b + ')" stop-opacity="0.4"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="100%" height="100%" fill="url(#g1)"/>' +
    '<rect y="60%" width="100%" height="40%" fill="url(#floor)"/>' +
    '<line x1="0" y1="60%" x2="100%" y2="60%" stroke="rgb(' + ac.r + ',' + ac.g + ',' + ac.b + ')" stroke-opacity="0.1" stroke-width="1"/>' +
    '<ellipse cx="50%" cy="90%" rx="40%" ry="5%" fill="rgba(0,0,0,0.08)"/>' +
    '</svg>';

  var background = await sharp(Buffer.from(svgBg)).resize(width, height).png().toBuffer();

  var productW = Math.round(width * 0.60);
  var productH = Math.round(height * 0.65);
  var product = await sharp(imageBuffer)
    .resize(productW, productH, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  var productMeta = await sharp(product).metadata();
  var left = Math.round((width - productMeta.width) / 2);
  var top = Math.round((height - productMeta.height) / 2 + height * 0.05);

  var shadowBuf = await sharp(product)
    .resize(Math.round(productMeta.width * 0.9), Math.round(productMeta.height * 0.12))
    .blur(20)
    .modulate({ brightness: 0 })
    .ensureAlpha(0.15)
    .png()
    .toBuffer();

  return sharp(background)
    .composite([
      { input: shadowBuf, left: left + Math.round(productMeta.width * 0.05), top: top + productMeta.height - Math.round(productMeta.height * 0.02), blend: 'over' },
      { input: product, left: left, top: top, blend: 'over' }
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    var { image, scenes: requestedScenes } = req.body;
    if (!image) return res.status(400).json({ error: 'Image is required' });

    var base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    var imageBuffer = Buffer.from(base64Data, 'base64');
    var width = 1200;
    var height = 1200;

    var selectedScenes = requestedScenes ? SCENES.filter(function(s) { return requestedScenes.includes(s.id); }) : SCENES;
    var hasPhotoroom = !!process.env.PHOTOROOM_API_KEY;

    console.log('[Scenes] Processing ' + selectedScenes.length + ' scenes, Photoroom: ' + hasPhotoroom);

    var results = await Promise.all(
      selectedScenes.map(async function(scene) {
        try {
          var sceneBuffer;
          var usedProvider = 'sharp';

          if (hasPhotoroom) {
            try {
              sceneBuffer = await generateWithPhotoroom(imageBuffer, scene.prompt);
              sceneBuffer = await sharp(sceneBuffer).resize(width, height, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();
              usedProvider = 'photoroom';
              console.log('[Scenes] Photoroom SUCCESS for ' + scene.id);
            } catch (e) {
              console.error('[Scenes] Photoroom failed for ' + scene.id + ':', e.message);
              sceneBuffer = await generateWithSharp(imageBuffer, scene, width, height);
            }
          } else {
            sceneBuffer = await generateWithSharp(imageBuffer, scene, width, height);
          }

          return {
            id: scene.id,
            name: scene.name,
            image: 'data:image/jpeg;base64,' + sceneBuffer.toString('base64'),
            success: true,
            provider: usedProvider
          };
        } catch (err) {
          return { id: scene.id, name: scene.name, success: false, error: err.message };
        }
      })
    );

    return res.status(200).json({
      scenes: results.filter(function(r) { return r.success; }),
      errors: results.filter(function(r) { return !r.success; }),
      total: results.length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

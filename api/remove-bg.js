import sharp from 'sharp';

export const config = { maxDuration: 60 };

async function removeWithPhotoroom(base64Data) {
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) throw new Error('PHOTOROOM_API_KEY not set');
  console.log('[RemoveBG] Trying Photoroom...');

  const imageBuffer = Buffer.from(base64Data, 'base64');
  const blob = new Blob([imageBuffer], { type: 'image/png' });
  const formData = new FormData();
  formData.append('image_file', blob, 'image.png');

  const response = await fetch('https://sdk.photoroom.com/v1/segment', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Photoroom ' + response.status + ': ' + errorText);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

async function removeWithSharp(base64Data) {
  console.log('[RemoveBG] Using Sharp fallback');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  const { data, info } = await sharp(imageBuffer)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const w = info.width;
  const samplePoints = [0, w - 1, (info.height - 1) * w, (info.height - 1) * w + w - 1];
  var bgR = 0, bgG = 0, bgB = 0;
  for (var idx of samplePoints) {
    bgR += pixels[idx * 4];
    bgG += pixels[idx * 4 + 1];
    bgB += pixels[idx * 4 + 2];
  }
  bgR = Math.round(bgR / 4);
  bgG = Math.round(bgG / 4);
  bgB = Math.round(bgB / 4);

  var tolerance = 35;
  for (var i = 0; i < pixels.length; i += 4) {
    var dr = Math.abs(pixels[i] - bgR);
    var dg = Math.abs(pixels[i + 1] - bgG);
    var db = Math.abs(pixels[i + 2] - bgB);
    if (dr < tolerance && dg < tolerance && db < tolerance) {
      pixels[i + 3] = 0;
    }
  }

  const transparentBuffer = await sharp(Buffer.from(pixels), {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).png().toBuffer();

  return { b64: transparentBuffer.toString('base64'), detectedBg: { r: bgR, g: bgG, b: bgB } };
}

async function addWhiteBackground(transparentBase64) {
  const buffer = Buffer.from(transparentBase64, 'base64');
  const metadata = await sharp(buffer).metadata();

  const whiteBuffer = await sharp({
    create: {
      width: metadata.width,
      height: metadata.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{ input: buffer, blend: 'over' }])
    .jpeg({ quality: 95 })
    .toBuffer();

  return whiteBuffer.toString('base64');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ success: false, error: 'imageBase64 is required' });

    const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    var transparentBase64 = null;
    var provider = 'sharp-fallback';
    var detectedBg = { r: 255, g: 255, b: 255 };

    console.log('[RemoveBG] PHOTOROOM_API_KEY available:', !!process.env.PHOTOROOM_API_KEY);

    if (process.env.PHOTOROOM_API_KEY) {
      try {
        transparentBase64 = await removeWithPhotoroom(base64);
        provider = 'photoroom';
        console.log('[RemoveBG] SUCCESS with Photoroom');
      } catch (e) {
        console.error('[RemoveBG] Photoroom failed:', e.message);
      }
    }

    if (!transparentBase64) {
      var result = await removeWithSharp(base64);
      transparentBase64 = result.b64;
      detectedBg = result.detectedBg;
      provider = 'sharp-fallback';
    }

    const whiteBase64 = await addWhiteBackground(transparentBase64);

    return res.status(200).json({
      success: true,
      images: {
        transparent: 'data:image/png;base64,' + transparentBase64,
        whiteBg: 'data:image/jpeg;base64,' + whiteBase64,
        detectedBg: detectedBg
      },
      provider: provider
    });
  } catch (error) {
    console.error('[RemoveBG] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao remover fundo',
      details: error.message
    });
  }
}

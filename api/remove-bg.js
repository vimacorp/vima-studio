import sharp from 'sharp';

export const config = { maxDuration: 60 };

const PHOTOROOM_V2 = 'https://image-api.photoroom.com/v2/edit';
const BORDER_PX = 24;
const BORDER_RGB = { r: 40, g: 40, b: 40 }; // dark gray — high contrast vs white products

// Pre-process: add a dark border so Photoroom never sees a pure-white frame
async function addContrastBorder(base64Data) {
  const buf = Buffer.from(base64Data, 'base64');
  const out = await sharp(buf)
    .extend({
      top: BORDER_PX,
      bottom: BORDER_PX,
      left: BORDER_PX,
      right: BORDER_PX,
      background: { ...BORDER_RGB, alpha: 1 }
    })
    .png()
    .toBuffer();
  return out.toString('base64');
}

// Post-process: crop the added border back off
async function cropBorder(transparentBase64) {
  const buf = Buffer.from(transparentBase64, 'base64');
  const meta = await sharp(buf).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w <= BORDER_PX * 2 || h <= BORDER_PX * 2) return transparentBase64;
  const cropped = await sharp(buf)
    .extract({
      left: BORDER_PX,
      top: BORDER_PX,
      width: w - BORDER_PX * 2,
      height: h - BORDER_PX * 2
    })
    .png()
    .toBuffer();
  return cropped.toString('base64');
}

async function removeWithPhotoroom(base64Data) {
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) throw new Error('PHOTOROOM_API_KEY not set');
  console.log('[RemoveBG] Trying Photoroom v2 (with contrast border)...');

  // 1) Add border for white-on-white safety
  const borderedB64 = await addContrastBorder(base64Data);
  const borderedBuf = Buffer.from(borderedB64, 'base64');

  // 2) Build multipart with v2 segmentation params
  const blob = new Blob([borderedBuf], { type: 'image/png' });
  const fd = new FormData();
  fd.append('imageFile', blob, 'image.png');
  fd.append('format', 'png');
  fd.append('size', 'full');
  // segmentation.prompt tells the AI to keep the PRODUCT as foreground,
  // even when the product itself is white and the background is white
  fd.append('segmentation.prompt', 'product');
  fd.append('segmentation.mode', 'foreground');

  const response = await fetch(PHOTOROOM_V2, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, Accept: 'image/png, application/json' },
    body: fd
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Photoroom v2 ' + response.status + ': ' + errorText);
  }

  const arrayBuffer = await response.arrayBuffer();
  const resultB64 = Buffer.from(arrayBuffer).toString('base64');

  // 3) Crop the border back off
  const finalB64 = await cropBorder(resultB64);
  return finalB64;
}

async function removeWithSharp(base64Data) {
  console.log('[RemoveBG] Using Sharp fallback');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  const { data, info } = await sharp(imageBuffer)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data);
  const samplePoints = [0, 4, info.width * 4 - 4, (info.height - 1) * info.width * 4];
  let bgR = 255, bgG = 255, bgB = 255;
  for (var idx of samplePoints) {
    bgR = pixels[idx];
    bgG = pixels[idx + 1];
    bgB = pixels[idx + 2];
  }
  const tolerance = 25;
  for (let i = 0; i < pixels.length; i += 4) {
    const dr = Math.abs(pixels[i] - bgR);
    const dg = Math.abs(pixels[i + 1] - bgG);
    const db = Math.abs(pixels[i + 2] - bgB);
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
    const imageBase64 = String(req.body?.imageBase64 || req.body?.image || '').replace(/^data:image\/[^;]+;base64,/, '');
    if (!imageBase64) return res.status(400).json({ success: false, error: 'imageBase64 is required' });

    let transparentBase64 = null;
    let detectedBg = null;
    let provider = 'sharp-fallback';

    console.log('[RemoveBG] PHOTOROOM_API_KEY available:', !!process.env.PHOTOROOM_API_KEY);

    if (process.env.PHOTOROOM_API_KEY) {
      try {
        transparentBase64 = await removeWithPhotoroom(imageBase64);
        provider = 'photoroom-v2';
        console.log('[RemoveBG] SUCCESS with Photoroom v2');
      } catch (e) {
        console.error('[RemoveBG] Photoroom failed:', e.message);
      }
    }

    if (!transparentBase64) {
      const fallback = await removeWithSharp(imageBase64);
      transparentBase64 = fallback.b64;
      detectedBg = fallback.detectedBg;
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

import sharp from 'sharp';

const PHOTOROOM_API_URL = 'https://sdk.photoroom.com/v1/segment';
const FREEPIK_API_URL = 'https://api.freepik.com/v1/ai/remove-background';

async function handlePhotoroom(base64Data) {
  const response = await fetch(PHOTOROOM_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.PHOTOROOM_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_file_b64: base64Data
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Photoroom API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.result_b64;
}

async function handleFreepik(base64Data) {
  const response = await fetch(FREEPIK_API_URL, {
    method: 'POST',
    headers: {
      'x-freepik-api-key': process.env.FREEPIK_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image: base64Data
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Freepik API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.image || result.data?.image;
}

async function handleSharpFallback(base64Data) {
  const imageBuffer = Buffer.from(base64Data, 'base64');

  const { data, info } = await sharp(imageBuffer)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const threshold = 230;
  const edgeBlur = 2;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r > threshold && g > threshold && b > threshold) {
      pixels[i + 3] = 0;
    }
  }

  const transparentBuffer = await sharp(Buffer.from(pixels), {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).png().toBuffer();

  return transparentBuffer.toString('base64');
}

async function addWhiteBackground(transparentBase64) {
  const buffer = Buffer.from(transparentBase64, 'base64');
  const image = sharp(buffer);
  const metadata = await image.metadata();

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    let transparentBase64;
    let provider = 'sharp-fallback';

    // Priority: Photoroom > Freepik > Sharp fallback
    if (process.env.PHOTOROOM_API_KEY) {
      try {
        transparentBase64 = await handlePhotoroom(base64);
        provider = 'photoroom';
      } catch (e) {
        console.error('Photoroom failed, trying Freepik:', e.message);
      }
    }

    if (!transparentBase64 && process.env.FREEPIK_API_KEY) {
      try {
        transparentBase64 = await handleFreepik(base64);
        provider = 'freepik';
      } catch (e) {
        console.error('Freepik failed, trying Sharp fallback:', e.message);
      }
    }

    if (!transparentBase64) {
      transparentBase64 = await handleSharpFallback(base64);
      provider = 'sharp-fallback';
    }

    // Generate white background version for marketplace use
    const whiteBase64 = await addWhiteBackground(transparentBase64);

    return res.status(200).json({
      transparentImage: `data:image/png;base64,${transparentBase64}`,
      whiteBackground: `data:image/jpeg;base64,${whiteBase64}`,
      provider
    });

  } catch (error) {
    console.error('Remove BG error:', error);
    return res.status(500).json({ error: 'Erro ao remover fundo', details: error.message });
  }
}

import sharp from 'sharp';

export const config = { maxDuration: 60 };

async function removeBackgroundPhotoroom(imageBuffer) {
  var apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) return null;

  try {
    console.log('[ProcessImage] Removing bg with Photoroom...');
    var blob = new Blob([imageBuffer], { type: 'image/png' });
    var formData = new FormData();
    formData.append('image_file', blob, 'image.png');

    var response = await fetch('https://sdk.photoroom.com/v1/segment', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: formData
    });

    if (!response.ok) throw new Error('Photoroom ' + response.status);

    var arrayBuffer = await response.arrayBuffer();
    console.log('[ProcessImage] Photoroom bg removal SUCCESS');
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error('[ProcessImage] Photoroom failed:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64' });

    var base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    var originalBuffer = Buffer.from(base64Data, 'base64');

    var cleanBuffer = await removeBackgroundPhotoroom(originalBuffer);
    var useClean = !!cleanBuffer;

    var variants = [
      { format: '1:1', label: 'Quadrado (Instagram)', width: 800, height: 800 },
      { format: '3:4', label: 'Portrait (Stories / Shopee)', width: 600, height: 800 },
      { format: '4:3', label: 'Landscape (Amazon)', width: 800, height: 600 },
      { format: '16:9', label: 'Banner (TikTok / YouTube)', width: 960, height: 540 },
      { format: 'original', label: 'Original (Cleaned Up)', width: 1200, height: 1200, isOriginal: true }
    ];

    var processedImages = await Promise.all(
      variants.map(async function(variant) {
        try {
          var sourceBuffer = useClean ? cleanBuffer : originalBuffer;
          var paddingX = Math.round(variant.width * 0.08);
          var paddingY = Math.round(variant.height * 0.08);
          var contentWidth = variant.width - (paddingX * 2);
          var contentHeight = variant.height - (paddingY * 2);

          var resized = await sharp(sourceBuffer)
            .resize(contentWidth, contentHeight, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toBuffer();

          var final = await sharp({
            create: {
              width: variant.width,
              height: variant.height,
              channels: 3,
              background: { r: 255, g: 255, b: 255 }
            }
          })
            .composite([{ input: resized, top: paddingY, left: paddingX }])
            .jpeg({ quality: 92 })
            .toBuffer();

          return {
            format: variant.format,
            label: variant.label,
            width: variant.width,
            height: variant.height,
            base64: 'data:image/jpeg;base64,' + final.toString('base64'),
            bgRemoved: useClean
          };
        } catch (err) {
          throw new Error('Failed ' + variant.format + ': ' + err.message);
        }
      })
    );

    return res.status(200).json({
      success: true,
      images: processedImages,
      bgRemoved: useClean,
      provider: useClean ? 'photoroom' : 'sharp'
    });
  } catch (error) {
    console.error('[ProcessImage] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Image processing failed',
      message: error.message
    });
  }
}

import sharp from 'sharp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64' });
    }

    // Extract base64 data, handling both with and without data:image prefix
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Define image variants with aspect ratios and labels
    const variants = [
      {
        format: '1:1',
        label: 'Quadrado (Instagram)',
        width: 800,
        height: 800
      },
      {
        format: '3:4',
        label: 'Portrait (Stories / Shopee)',
        width: 600,
        height: 800
      },
      {
        format: '4:3',
        label: 'Landscape (Amazon)',
        width: 800,
        height: 600
      },
      {
        format: '16:9',
        label: 'Banner (TikTok / YouTube)',
        width: 960,
        height: 540
      },
      {
        format: 'original',
        label: 'Original (Cleaned Up)',
        width: 1200,
        height: 1200,
        isOriginal: true
      }
    ];

    // Process each variant
    const processedImages = await Promise.all(
      variants.map(async (variant) => {
        try {
          let processed;

          if (variant.isOriginal) {
            // For original, just resize to fit within max dimensions maintaining aspect ratio
            processed = await sharp(imageBuffer)
              .resize(variant.width, variant.height, {
                fit: 'inside',
                withoutEnlargement: true
              })
              .toBuffer();
          } else {
            // For variants, use contain fit with white background
            processed = await sharp(imageBuffer)
              .resize(variant.width, variant.height, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
              })
              .toBuffer();
          }

          // Add 5% padding to the image
          const paddingX = Math.round(variant.width * 0.05);
          const paddingY = Math.round(variant.height * 0.05);
          const contentWidth = variant.width - (paddingX * 2);
          const contentHeight = variant.height - (paddingY * 2);

          // Create padded version with white background
          const paddedImage = await sharp({
            create: {
              width: variant.width,
              height: variant.height,
              channels: 3,
              background: { r: 255, g: 255, b: 255 }
            }
          })
            .composite([
              {
                input: await sharp(processed)
                  .resize(contentWidth, contentHeight, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                  })
                  .toBuffer(),
                top: paddingY,
                left: paddingX
              }
            ])
            .jpeg({ quality: 90 })
            .toBuffer();

          // Convert to base64 with data URI prefix
          const base64Result = paddedImage.toString('base64');
          const dataUri = `data:image/jpeg;base64,${base64Result}`;

          return {
            format: variant.format,
            label: variant.label,
            width: variant.width,
            height: variant.height,
            base64: dataUri
          };
        } catch (variantError) {
          console.error(`Error processing variant ${variant.format}:`, variantError);
          throw new Error(`Failed to process ${variant.format} variant: ${variantError.message}`);
        }
      })
    );

    return res.status(200).json({
      success: true,
      images: processedImages
    });
  } catch (error) {
    console.error('Image processing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Image processing failed',
      message: error.message
    });
  }
}

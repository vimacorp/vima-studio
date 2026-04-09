import sharp from 'sharp';

export const config = { maxDuration: 60 };

const SCENES = [
  { id: 'living-room', name: 'Sala de Estar', bg: { r: 245, g: 235, b: 220 }, accent: { r: 180, g: 140, b: 100 }, shadow: 0.15 },
  { id: 'kitchen', name: 'Cozinha', bg: { r: 240, g: 245, b: 245 }, accent: { r: 160, g: 180, b: 170 }, shadow: 0.12 },
  { id: 'office', name: 'Escrit\u00f3rio', bg: { r: 235, g: 235, b: 240 }, accent: { r: 100, g: 120, b: 150 }, shadow: 0.18 },
  { id: 'bedroom', name: 'Quarto', bg: { r: 248, g: 240, b: 245 }, accent: { r: 180, g: 160, b: 175 }, shadow: 0.10 },
  { id: 'outdoor', name: 'Ambiente Externo', bg: { r: 230, g: 245, b: 230 }, accent: { r: 120, g: 160, b: 120 }, shadow: 0.20 },
  { id: 'studio', name: 'Est\u00fadio Fotogr\u00e1fico', bg: { r: 250, g: 250, b: 250 }, accent: { r: 200, g: 200, b: 200 }, shadow: 0.08 },
  { id: 'store', name: 'Vitrine de Loja', bg: { r: 255, g: 248, b: 235 }, accent: { r: 200, g: 170, b: 120 }, shadow: 0.14 },
  { id: 'minimalist', name: 'Minimalista', bg: { r: 245, g: 245, b: 245 }, accent: { r: 220, g: 220, b: 220 }, shadow: 0.06 }
];

async function createSceneImage(imageBuffer, scene, width, height) {
  const bg = scene.bg;
  const ac = scene.accent;

  const svgBg = `<svg width="${width}" height="${height}">
    <defs>
      <radialGradient id="g1" cx="50%" cy="40%" r="70%">
        <stop offset="0%" stop-color="rgb(${bg.r},${bg.g},${bg.b})"/>
        <stop offset="100%" stop-color="rgb(${Math.max(0,bg.r-25)},${Math.max(0,bg.g-25)},${Math.max(0,bg.b-25)})"/>
      </radialGradient>
      <linearGradient id="g2" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="rgb(${ac.r},${ac.g},${ac.b})" stop-opacity="0.3"/>
        <stop offset="40%" stop-color="rgb(${ac.r},${ac.g},${ac.b})" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g1)"/>
    <rect width="100%" height="100%" fill="url(#g2)"/>
    <ellipse cx="50%" cy="88%" rx="35%" ry="4%" fill="rgba(${ac.r},${ac.g},${ac.b},0.15)"/>
  </svg>`;

  const background = await sharp(Buffer.from(svgBg)).resize(width, height).png().toBuffer();

  const productW = Math.round(width * 0.65);
  const productH = Math.round(height * 0.65);
  const product = await sharp(imageBuffer)
    .resize(productW, productH, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const productMeta = await sharp(product).metadata();
  const left = Math.round((width - productMeta.width) / 2);
  const top = Math.round((height - productMeta.height) / 2 + height * 0.05);

  const shadowBuf = await sharp(product)
    .resize(Math.round(productMeta.width * 0.95), Math.round(productMeta.height * 0.15))
    .blur(15)
    .modulate({ brightness: 0 })
    .ensureAlpha(scene.shadow)
    .png()
    .toBuffer();

  const result = await sharp(background)
    .composite([
      { input: shadowBuf, left: left + Math.round(productMeta.width * 0.025), top: top + productMeta.height - Math.round(productMeta.height * 0.05), blend: 'over' },
      { input: product, left, top, blend: 'over' }
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  return result;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { image, scenes: requestedScenes } = req.body;
    if (!image) return res.status(400).json({ error: 'Image is required' });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const width = 1200;
    const height = 1200;

    const selectedScenes = requestedScenes
      ? SCENES.filter(s => requestedScenes.includes(s.id))
      : SCENES;

    const results = await Promise.all(
      selectedScenes.map(async (scene) => {
        try {
          const sceneBuffer = await createSceneImage(imageBuffer, scene, width, height);
          const base64 = sceneBuffer.toString('base64');
          return {
            id: scene.id,
            name: scene.name,
            image: `data:image/jpeg;base64,${base64}`,
            success: true
          };
        } catch (err) {
          return { id: scene.id, name: scene.name, success: false, error: err.message };
        }
      })
    );

    return res.status(200).json({
      scenes: results.filter(r => r.success),
      errors: results.filter(r => !r.success),
      total: results.length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

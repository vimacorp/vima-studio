import sharp from 'sharp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var { imageBase64, tolerance, edgeSoftness } = req.body;
    tolerance = tolerance || 35;
    edgeSoftness = edgeSoftness || 8;
    if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64' });

    var base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    var imageBuffer = Buffer.from(base64Data, 'base64');

    var raw = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    var pixels = new Uint8Array(raw.data);
    var width = raw.info.width;
    var height = raw.info.height;
    var channels = raw.info.channels;

    // Sample background color from edges
    var sampleSize = Math.min(20, Math.floor(width * 0.05));
    var rSum = 0, gSum = 0, bSum = 0, count = 0;

    function samplePixel(x, y) {
      var idx = (y * width + x) * channels;
      rSum += pixels[idx]; gSum += pixels[idx+1]; bSum += pixels[idx+2]; count++;
    }

    for (var ci = 0; ci < sampleSize; ci++) {
      for (var cj = 0; cj < sampleSize; cj++) {
        samplePixel(ci, cj);
        samplePixel(width-1-ci, cj);
        samplePixel(ci, height-1-cj);
        samplePixel(width-1-ci, height-1-cj);
      }
    }
    for (var ex = 0; ex < width; ex += Math.max(1, Math.floor(width/100))) {
      for (var row = 0; row < 3; row++) { samplePixel(ex, row); samplePixel(ex, height-1-row); }
    }
    for (var ey = 0; ey < height; ey += Math.max(1, Math.floor(height/100))) {
      for (var col = 0; col < 3; col++) { samplePixel(col, ey); samplePixel(width-1-col, ey); }
    }

    var bgR = Math.round(rSum/count);
    var bgG = Math.round(gSum/count);
    var bgB = Math.round(bSum/count);
    var tol = Number(tolerance);
    var soft = Number(edgeSoftness);
    var result = Buffer.from(pixels);

    // Initial pass - mark potential background pixels
    for (var pi = 0; pi < pixels.length; pi += channels) {
      var dist = Math.sqrt(Math.pow(pixels[pi]-bgR,2) + Math.pow(pixels[pi+1]-bgG,2) + Math.pow(pixels[pi+2]-bgB,2));
      if (dist < tol) result[pi+3] = 0;
      else if (dist < tol + soft) result[pi+3] = Math.round(((dist-tol)/soft)*255);
      else result[pi+3] = 255;
    }

    // Flood fill from edges - only remove connected background
    var visited = new Uint8Array(width * height);
    var isBackground = new Uint8Array(width * height);
    var queue = [];
    for (var fx = 0; fx < width; fx++) { queue.push(fx); queue.push((height-1)*width+fx); }
    for (var fy = 1; fy < height-1; fy++) { queue.push(fy*width); queue.push(fy*width+width-1); }

    var qi = 0;
    while (qi < queue.length) {
      var pos = queue[qi++];
      if (visited[pos]) continue;
      visited[pos] = 1;
      if (result[pos*channels+3] < 128) {
        isBackground[pos] = 1;
        var bx = pos % width;
        var by = Math.floor(pos / width);
        if (bx > 0 && !visited[pos-1]) queue.push(pos-1);
        if (bx < width-1 && !visited[pos+1]) queue.push(pos+1);
        if (by > 0 && !visited[pos-width]) queue.push(pos-width);
        if (by < height-1 && !visited[pos+width]) queue.push(pos+width);
      }
    }

    // Final pass
    for (var fi = 0; fi < width*height; fi++) {
      var px = fi * channels;
      if (isBackground[fi]) {
        var d = Math.sqrt(Math.pow(pixels[px]-bgR,2)+Math.pow(pixels[px+1]-bgG,2)+Math.pow(pixels[px+2]-bgB,2));
        if (d < tol) result[px+3] = 0;
        else if (d < tol+soft) result[px+3] = Math.round(((d-tol)/soft)*255);
      } else {
        result[px+3] = 255;
      }
    }

    var transparentPng = await sharp(result, { raw: { width, height, channels: 4 } }).png().toBuffer();
    var whiteBgJpeg = await sharp(result, { raw: { width, height, channels: 4 } }).flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({ quality: 92 }).toBuffer();

    return res.status(200).json({
      success: true,
      images: {
        transparent: 'data:image/png;base64,' + transparentPng.toString('base64'),
        whiteBg: 'data:image/jpeg;base64,' + whiteBgJpeg.toString('base64'),
        detectedBg: { r: bgR, g: bgG, b: bgB }
      }
    });
  } catch (error) {
    console.error('BG removal error:', error);
    return res.status(500).json({ success: false, error: 'Background removal failed', message: error.message });
  }
}

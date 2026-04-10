// api/pipeline/context.js
// VIMA STUDIO — Shared Pipeline Context
// The single object that travels through every stage of the pipeline.
// Any stage reads what previous stages wrote and appends its own slice.

/**
 * @typedef {Object} PipelineContext
 * @property {string} runId                       - UUID for this generation run
 * @property {string} createdAt                   - ISO timestamp
 * @property {Object} input
 * @property {string} input.imageBase64           - Original product photo (base64, no prefix)
 * @property {string} input.imageMime             - e.g. "image/jpeg"
 * @property {string} input.productName           - User-provided name (optional)
 * @property {string} input.productDescription    - User-provided short desc (optional)
 * @property {string} input.marketplace           - "mercadolivre" | "amazon" | "shopee" | ...
 *
 * @property {Object|null} visualAnalysis         - Filled by Stage 1 (Visual Analyst)
 * @property {Object|null} marketIntel            - Filled by Stage 2 (future)
 * @property {Object|null} brandVoice             - Filled by Stage 4 (future)
 * @property {Object|null} copy                   - Filled by Stage 5 (Copywriter)
 * @property {Object|null} scenePlan              - Filled by Stage 7 (Creative Director)
 * @property {Array}      renderedScenes          - Filled by Stage 8 (Scene Rendering)
 * @property {Object|null} qualityReport          - Filled by Stage 9 (Image Quality Gate)
 *
 * @property {Array<{stage:string, ms:number, ok:boolean, error?:string}>} timeline
 */

export function createContext(input) {
  return {
    runId: cryptoRandomId(),
    createdAt: new Date().toISOString(),
    input: {
      imageBase64: input.imageBase64,
      imageMime: input.imageMime || 'image/jpeg',
      productName: input.productName || '',
      productDescription: input.productDescription || '',
      marketplace: input.marketplace || 'mercadolivre',
    },
    visualAnalysis: null,
    marketIntel: null,
    brandVoice: null,
    copy: null,
    scenePlan: null,
    renderedScenes: [],
    qualityReport: null,
    timeline: [],
  };
}

export async function runStage(ctx, name, fn) {
  const t0 = Date.now();
  try {
    const out = await fn(ctx);
    ctx.timeline.push({ stage: name, ms: Date.now() - t0, ok: true });
    return out;
  } catch (err) {
    ctx.timeline.push({
      stage: name,
      ms: Date.now() - t0,
      ok: false,
      error: err?.message || String(err),
    });
    throw err;
  }
}

function cryptoRandomId() {
  // Vercel Node 24 has globalThis.crypto
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'run_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

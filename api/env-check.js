// api/env-check.js
// Diagnostic endpoint: reports which env vars are configured (boolean only, no values)

export default function handler(req, res) {
  const keys = [
    "ANTHROPIC_API_KEY",
    "FREEPIK_API_KEY",
    "PHOTOROOM_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ];
  const configured = {};
  for (const k of keys) {
    const v = process.env[k];
    configured[k] = !!(v && v.length > 0);
  }
  res.status(200).json({
    configured,
    nodeVersion: process.version,
    runtime: "nodejs",
    timestamp: new Date().toISOString()
  });
}

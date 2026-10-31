import { V, guard, hdr, q } from './_lib.js'
export default async function handler(req, res) {
  if (!guard(req, res)) return
  const r = await fetch(`${V}/v6/deployments${q('limit=15')}`, { headers: hdr() })
  const j = await r.json()
  if (!r.ok) return res.status(r.status).json({ error: j.error?.message || 'Gagal memuat riwayat' })
  res.json((j.deployments || []).map(d => ({ id: d.uid, name: d.name, url: d.url, state: d.state, created: d.created })))
}

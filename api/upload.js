import { V, guard, hdr, q } from './_lib.js'
export const config = { api: { bodyParser: false } }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!guard(req, res)) return
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = Buffer.concat(chunks)
  const r = await fetch(V + '/v2/files' + q(), {
    method: 'POST',
    headers: { ...hdr(), 'Content-Type': 'application/octet-stream', 'x-vercel-digest': req.headers['x-sha'] },
    body
  })
  if (r.ok) return res.json({ ok: true })
  const j = await r.json().catch(() => ({}))
  res.status(r.status).json({ error: j.error?.message || 'Upload file gagal' })
}

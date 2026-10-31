import { V, guard, hdr, q } from './_lib.js'
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!guard(req, res)) return
  const { name, files, from } = req.body || {}
  const body = from
    ? { name, deploymentId: from, target: 'production' }
    : { name, files, target: 'production' }
  const r = await fetch(V + '/v13/deployments' + q(from ? 'forceNew=1' : 'skipAutoDetectionConfirmation=1'), {
    method: 'POST',
    headers: { ...hdr(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const j = await r.json()
  if (!r.ok) return res.status(r.status).json({ error: j.error?.message || 'Deploy gagal' })
  res.json({ id: j.id, url: j.url, state: j.readyState })
}

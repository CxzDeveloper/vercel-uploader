import { V, guard, hdr, q } from './_lib.js'
export default async function handler(req, res) {
  if (!guard(req, res)) return
  const { id } = req.query
  const [d, e] = await Promise.all([
    fetch(`${V}/v13/deployments/${id}${q()}`, { headers: hdr() }).then(r => r.json()),
    fetch(`${V}/v3/deployments/${id}/events${q('direction=forward&limit=-1')}`, { headers: hdr() })
      .then(r => r.json()).catch(() => [])
  ])
  const logs = Array.isArray(e) ? e.map(x => x.text ?? x.payload?.text).filter(Boolean) : []
  res.json({ state: d.readyState, url: d.url, error: d.error?.message, logs })
}

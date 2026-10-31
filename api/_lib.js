export const V = 'https://api.vercel.com'
export const hdr = () => ({ Authorization: `Bearer ${process.env.VERCELL_TOKEN}` })
export const q = (extra = '') => {
  const t = process.env.VERCEL_TEAM_ID
  return `?${t ? `teamId=${t}&` : ''}${extra}`
}
export function guard(req, res) {
  const pw = process.env.APP_PASSWORD
  if (pw && req.headers['x-app-password'] !== pw) {
    res.status(401).json({ error: 'Password salah' })
    return false
  }
  if (!process.env.VERCELL_TOKEN) {
    res.status(500).json({ error: 'VERCEL_TOKEN belum diatur di environment variables' })
    return false
  }
  return true
}

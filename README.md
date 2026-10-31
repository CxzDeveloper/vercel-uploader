# ZipDeploy

Unggah ZIP → deploy otomatis ke Vercel lewat API. Token Vercel hanya ada di serverless functions (`/api`), tidak pernah dikirim ke browser.

## Deploy aplikasi ini ke Vercel
1. Upload folder ini ke repo GitHub, lalu *Add New Project* di vercel.com dan impor repo-nya.
   Atau lewat CLI: `npm i -g vercel && vercel --prod`
2. Di *Settings → Environment Variables* isi:
   - `VERCEL_TOKEN` — buat di vercel.com/account/tokens
   - `APP_PASSWORD` — password untuk masuk ke aplikasi (sangat disarankan)
   - `VERCEL_TEAM_ID` — hanya jika deploy ke akun Team
3. Redeploy, lalu buka URL-nya.

## Cara kerja
Browser membuka ZIP (JSZip), menghitung SHA1 tiap file, mengunggah file satu per satu ke `/api/upload` (proxy ke `POST /v2/files`), lalu `/api/deploy` membuat deployment (`POST /v13/deployments`). `/api/status` polling status + log, `/api/history` memuat riwayat dari Vercel, dan "Deploy ulang" memakai `deploymentId`.

## Batasan
- Satu file maksimal 4 MB (batas body serverless Vercel 4,5 MB), ZIP maksimal 100 MB.
- ZIP tidak disimpan di server sama sekali (diproses di browser), jadi tidak perlu penghapusan otomatis.
- Belum ada: alias domain kustom, webhook, notifikasi email. Bisa ditambahkan lewat endpoint `/v2/aliases` dan `/v1/webhooks`.

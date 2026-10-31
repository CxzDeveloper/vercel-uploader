import { useState, useEffect, useRef, useCallback } from 'react'
import JSZip from 'jszip'

const MAX_ZIP = 100 * 1024 * 1024
const MAX_FILE = 4 * 1024 * 1024
const LABEL = { QUEUED: 'Antre', INITIALIZING: 'Menyiapkan', BUILDING: 'Membangun', READY: 'Siap', ERROR: 'Gagal', CANCELED: 'Dibatalkan' }
const tone = s => (s === 'READY' ? 'ok' : s === 'ERROR' || s === 'CANCELED' ? 'bad' : 'wait')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const sha1 = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-1', b))].map(x => x.toString(16).padStart(2, '0')).join('')
const fmt = n => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB')
const slug = s => s.replace(/\.zip$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'proyek'

export default function App() {
  const [pw, setPw] = useState(sessionStorage.getItem('pw'))
  const [pwInput, setPwInput] = useState('')
  const [file, setFile] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [dep, setDep] = useState(null)
  const [logs, setLogs] = useState([])
  const [history, setHistory] = useState(null)
  const [toast, setToast] = useState(null)
  const [drag, setDrag] = useState(false)
  const logRef = useRef()
  const busy = phase !== 'idle' && phase !== 'done'

  const say = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3800) }

  const api = useCallback(async (path, opts = {}) => {
    const r = await fetch('/api/' + path, { ...opts, headers: { 'x-app-password': pw || '', ...(opts.headers || {}) } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `Permintaan gagal (${r.status})`)
    return j
  }, [pw])

  const loadHistory = useCallback(() => api('history').then(setHistory).catch(e => { setHistory([]); say(e.message, 'bad') }), [api])
  useEffect(() => { if (pw !== null) loadHistory() }, [pw, loadHistory])
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }) }, [logs])

  const withRetry = async (fn, n = 3) => {
    for (let i = 0; ; i++) {
      try { return await fn() } catch (e) { if (i >= n - 1) throw e; await sleep(600 * 2 ** i) }
    }
  }

  const pick = f => {
    if (!f) return
    if (!/\.zip$/i.test(f.name)) return say('File harus berformat .zip', 'bad')
    if (f.size > MAX_ZIP) return say('Ukuran ZIP maksimal 100 MB', 'bad')
    setFile(f)
  }

  const poll = async id => {
    setPhase('building')
    for (;;) {
      const s = await api('status?id=' + id)
      setLogs(s.logs)
      setDep(d => ({ ...d, state: s.state, url: s.url || d?.url }))
      if (s.state === 'READY') { say('Deploy berhasil'); break }
      if (s.state === 'ERROR' || s.state === 'CANCELED') { say(s.error || 'Build gagal. Lihat log untuk detailnya.', 'bad'); break }
      await sleep(2500)
    }
    setPhase('done'); loadHistory()
  }

  const start = async () => {
    try {
      setLogs([]); setDep(null); setProgress(0); setPhase('reading')
      const zip = await JSZip.loadAsync(file)
      const entries = Object.values(zip.files).filter(f => !f.dir && !/(^|\/)(__MACOSX|node_modules|\.git)\//.test(f.name) && !/\.DS_Store$/.test(f.name))
      if (!entries.length) throw new Error('ZIP kosong atau tidak berisi file proyek')
      const roots = new Set(entries.map(e => e.name.split('/')[0]))
      const strip = roots.size === 1 && entries.every(e => e.name.includes('/')) ? roots.values().next().value + '/' : ''
      const items = []
      for (const e of entries) {
        const data = await e.async('uint8array')
        if (data.length > MAX_FILE) throw new Error(`${e.name} melebihi 4 MB (batas upload serverless Vercel)`)
        items.push({ file: e.name.slice(strip.length), data, size: data.length, sha: await sha1(data) })
      }
      if (!items.some(i => i.file === 'package.json' || i.file === 'index.html'))
        throw new Error('Tidak ditemukan package.json atau index.html di root ZIP')

      setPhase('uploading')
      let done = 0, idx = 0
      const worker = async () => {
        while (idx < items.length) {
          const it = items[idx++]
          await withRetry(() => api('upload', { method: 'POST', headers: { 'x-sha': it.sha }, body: it.data }))
          setProgress(Math.round((++done / items.length) * 100))
        }
      }
      await Promise.all([worker(), worker(), worker(), worker()])

      setPhase('creating')
      const d = await withRetry(() => api('deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: slug(file.name), files: items.map(({ file, sha, size }) => ({ file, sha, size })) })
      }))
      setDep(d); await poll(d.id)
    } catch (e) { say(e.message, 'bad'); setPhase('idle') }
  }

  const redeploy = async h => {
    try {
      setLogs([]); setProgress(100); setPhase('creating')
      const d = await api('deploy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: h.name, from: h.id }) })
      setDep(d); await poll(d.id)
    } catch (e) { say(e.message, 'bad'); setPhase('idle') }
  }

  const copy = u => navigator.clipboard.writeText('https://' + u).then(() => say('URL disalin'))
  const enter = () => { sessionStorage.setItem('pw', pwInput); setPw(pwInput) }

  if (pw === null) return (
    <main className="gate">
      <section className="clay pop">
        <h1>ZipDeploy</h1>
        <p>Masukkan password aplikasi. Kosongkan jika APP_PASSWORD belum diatur.</p>
        <input type="password" aria-label="Password" value={pwInput} onChange={e => setPwInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && enter()} />
        <button className="btn" onClick={enter}>Masuk</button>
      </section>
    </main>
  )

  const steps = ['reading', 'uploading', 'creating', 'building']
  const stepLabel = { reading: 'Membaca ZIP', uploading: `Mengunggah ${progress}%`, creating: 'Membuat deployment', building: 'Membangun' }

  return (
    <>
      <header><h1>ZipDeploy</h1><span>Unggah ZIP, langsung online di Vercel</span></header>
      <main className="grid">
        <section className="clay fade">
          <h2>Unggah proyek</h2>
          <label className={'drop' + (drag ? ' on' : '')} onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}>
            <input type="file" accept=".zip" hidden disabled={busy} onChange={e => pick(e.target.files[0])} />
            {file ? <><b>{file.name}</b><small>{fmt(file.size)}</small></> : <><b>Tarik file ZIP ke sini</b><small>atau klik untuk memilih, maks. 100 MB</small></>}
          </label>
          <button className="btn" disabled={!file || busy} onClick={start}>{busy ? 'Memproses…' : 'Deploy sekarang'}</button>
          {busy && <ol className="steps" aria-live="polite">{steps.map(s => (
            <li key={s} className={s === phase ? 'cur' : steps.indexOf(s) < steps.indexOf(phase) ? 'done' : ''}>{stepLabel[s]}</li>))}</ol>}
          {phase === 'uploading' && <div className="bar"><i style={{ width: progress + '%' }} /></div>}
          {dep && (
            <div className="result pop">
              <span className={'pill ' + tone(dep.state)}>{LABEL[dep.state] || dep.state}</span>
              {dep.url && <><a href={'https://' + dep.url} target="_blank" rel="noreferrer">{dep.url}</a>
                <button className="mini" onClick={() => copy(dep.url)}>Salin URL</button></>}
            </div>
          )}
        </section>

        <section className="clay fade d1">
          <h2>Log build</h2>
          <pre ref={logRef} className="logs" tabIndex={0}>{logs.length ? logs.map((l, i) => <div key={i} className={/error|failed/i.test(l) ? 'err' : ''}>{l}</div>) : 'Log akan muncul di sini setelah deploy dimulai.'}</pre>
        </section>

        <section className="clay fade d2 wide">
          <h2>Riwayat deployment</h2>
          {history === null ? <div className="skel" /> : !history.length ? <p>Belum ada deployment. Unggah ZIP pertama Anda.</p> : (
            <ul className="hist">{history.map(h => (
              <li key={h.id}>
                <span className={'pill ' + tone(h.state)}>{LABEL[h.state] || h.state}</span>
                <a href={'https://' + h.url} target="_blank" rel="noreferrer">{h.url}</a>
                <small>{new Date(h.created).toLocaleString('id-ID')}</small>
                <button className="mini" disabled={busy} onClick={() => redeploy(h)}>Deploy ulang</button>
              </li>))}</ul>
          )}
        </section>
      </main>
      {toast && <div className={'toast pop ' + toast.kind} role="status">{toast.msg}</div>}
    </>
  )
}

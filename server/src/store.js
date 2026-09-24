import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'

fs.mkdirSync(path.join(config.dataDir, 'jobs'), { recursive: true })
const db = new DatabaseSync(path.join(config.dataDir, 'jobs.db'))

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  params TEXT NOT NULL,
  result TEXT,
  error TEXT,
  consent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`)

export const jobDir = (id) => path.join(config.dataDir, 'jobs', id)

const row = (r) =>
  r && {
    id: r.id,
    type: r.type,
    status: r.status,
    progress: r.progress,
    params: JSON.parse(r.params),
    result: r.result ? JSON.parse(r.result) : null,
    error: r.error,
    consent: !!r.consent,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }

export function insertJob({ id, type, params, consent }) {
  const now = Date.now()
  db.prepare(
    'INSERT INTO jobs (id,type,status,params,consent,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run(id, type, 'queued', JSON.stringify(params), consent ? 1 : 0, now, now)
  fs.mkdirSync(jobDir(id), { recursive: true })
}

export function getJob(id) {
  return row(db.prepare('SELECT * FROM jobs WHERE id=?').get(id))
}

export function listJobs(limit = 50) {
  return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit).map(row)
}

export function updateJob(id, patch) {
  const cur = db.prepare('SELECT * FROM jobs WHERE id=?').get(id)
  if (!cur) return null
  const next = {
    status: patch.status ?? cur.status,
    progress: patch.progress ?? cur.progress,
    result: patch.result !== undefined ? JSON.stringify(patch.result) : cur.result,
    error: patch.error !== undefined ? patch.error : cur.error,
  }
  db.prepare('UPDATE jobs SET status=?,progress=?,result=?,error=?,updated_at=? WHERE id=?').run(
    next.status, next.progress, next.result, next.error, Date.now(), id,
  )
  return getJob(id)
}

// Unlinks a file ComfyUI wrote, only if it resolves inside `base` (names come from ComfyUI's API).
function unlinkInside(base, ...parts) {
  if (!base) return
  const file = path.resolve(base, ...parts.filter(Boolean))
  if (!file.startsWith(path.resolve(base) + path.sep)) return
  fs.rmSync(file, { force: true })
}

// Deletes a finished job everywhere: its folder, ComfyUI's input/output copies and the DB row.
export function removeJob(id) {
  const job = getJob(id)
  if (!job || job.status === 'queued' || job.status === 'running') return false
  const files = job.result?.meta?.comfyFiles
  for (const name of files?.inputs ?? []) unlinkInside(config.comfyInputDir, name)
  for (const o of files?.outputs ?? []) unlinkInside(config.comfyOutputDir, o.subfolder, o.filename)
  fs.rmSync(jobDir(id), { recursive: true, force: true })
  db.prepare('DELETE FROM jobs WHERE id=?').run(id)
  return true
}

export function purgeOlderThan(hours) {
  const cutoff = Date.now() - hours * 3600 * 1000
  const old = db.prepare("SELECT id FROM jobs WHERE created_at < ? AND status NOT IN ('queued','running')").all(cutoff)
  return old.filter(({ id }) => removeJob(id)).length
}

export function failInterrupted() {
  db.prepare("UPDATE jobs SET status='error', error='Servidor reiniciado', updated_at=? WHERE status IN ('queued','running')").run(Date.now())
}

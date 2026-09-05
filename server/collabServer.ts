// Yjs collaboration server — realtime block sync + presence relay.
// Run: npm run collab (tsx server/collabServer.ts), default ws://localhost:3002.
// Single-instance: docs live in memory with debounced disk snapshots in
// server/collab-data/ (gitignored). For multi-instance, back getDoc/persist
// with Postgres bytea or Redis instead of the filesystem.
//
// Auth: clients send ?token=<jwt|demo-token> (y-websocket `params` option).
// demo-token is accepted for zero-setup dev; set COLLAB_REQUIRE_AUTH=1 in
// production to require a real JWT (see server/auth.ts).
import { WebSocketServer, WebSocket } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { verifyToken } from './auth.js'

dotenv.config()

const PORT = process.env.COLLAB_PORT ? Number(process.env.COLLAB_PORT) : 3002
const REQUIRE_AUTH = process.env.COLLAB_REQUIRE_AUTH === '1'
const DATA_DIR = path.join(process.cwd(), 'server', 'collab-data')
const PING_INTERVAL = 30_000

const messageSync = 0
const messageAwareness = 1

interface DocEntry {
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  conns: Set<WebSocket>
  saveTimer: ReturnType<typeof setTimeout> | null
}

const docs = new Map<string, DocEntry>()

function docPath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
  return path.join(DATA_DIR, `${safe}.bin`)
}

function getDoc(name: string): DocEntry {
  let entry = docs.get(name)
  if (!entry) {
    const doc = new Y.Doc()
    try {
      const p = docPath(name)
      if (fs.existsSync(p)) {
        Y.applyUpdate(doc, fs.readFileSync(p))
        console.log(`[collab] restored ${name}`)
      }
    } catch (e) {
      console.error(`[collab] restore ${name} failed`, e)
    }
    const awareness = new awarenessProtocol.Awareness(doc)
    awareness.on('update', ({ added, updated, removed }: any) => {
      const changed = [...added, ...updated, ...removed]
      if (changed.length === 0) return
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, messageAwareness)
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed))
      broadcast(entry!, encoding.toUint8Array(enc))
    })
    entry = { doc, awareness, conns: new Set(), saveTimer: null }
    doc.on('update', () => {
      if (entry!.saveTimer) return
      entry!.saveTimer = setTimeout(() => {
        entry!.saveTimer = null
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true })
          fs.writeFileSync(docPath(name), Buffer.from(Y.encodeStateAsUpdate(doc)))
        } catch (e) {
          console.error(`[collab] snapshot ${name} failed`, e)
        }
      }, 2000)
    })
    docs.set(name, entry)
  }
  return entry
}

function broadcast(entry: DocEntry, bytes: Uint8Array) {
  for (const conn of entry.conns) {
    if (conn.readyState === WebSocket.OPEN) conn.send(bytes, { binary: true })
  }
}

function checkAuth(token: string | null): boolean {
  if (!token) return false
  if (token === 'demo-token') return !REQUIRE_AUTH
  return verifyToken(token) !== null
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const docName = (url.searchParams.get('room') || url.pathname.replace(/^\//, '') || 'lobby').slice(0, 160)
  const token = url.searchParams.get('token')

  if (!checkAuth(token)) {
    ws.close(4401, 'unauthorized')
    return
  }

  // y-websocket client connects to `${url}/${room}` — strip to room name.
  const room = docName.includes('/') ? docName.slice(docName.lastIndexOf('/') + 1) : docName
  const entry = getDoc(room || 'lobby')
  entry.conns.add(ws)
  const controlledIds = new Set<number>()
  console.log(`[collab] join ${room} (${entry.conns.size} conns)`)

  // Initial sync step 1
  {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, messageSync)
    syncProtocol.writeSyncStep1(enc, entry.doc)
    ws.send(encoding.toUint8Array(enc), { binary: true })
  }
  // Send current awareness states to the newcomer
  {
    const states = entry.awareness.getStates()
    if (states.size > 0) {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, messageAwareness)
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(entry.awareness, Array.from(states.keys())),
      )
      ws.send(encoding.toUint8Array(enc), { binary: true })
    }
  }

  let pongReceived = true
  const pingTimer = setInterval(() => {
    if (!pongReceived) {
      ws.terminate()
      return
    }
    pongReceived = false
    try { ws.ping() } catch { /* closed */ }
  }, PING_INTERVAL)
  ws.on('pong', () => { pongReceived = true })

  ws.on('message', (message: Buffer) => {
    pongReceived = true
    try {
      const enc = encoding.createEncoder()
      const dec = decoding.createDecoder(new Uint8Array(message))
      const type = decoding.readVarUint(dec)
      if (type === messageSync) {
        encoding.writeVarUint(enc, messageSync)
        syncProtocol.readSyncMessage(dec, enc, entry.doc, ws)
        if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc), { binary: true })
      } else if (type === messageAwareness) {
        const update = decoding.readVarUint8Array(dec)
        // Track sender ids so we can clean up presence on disconnect.
        const before = new Set(entry.awareness.getStates().keys())
        awarenessProtocol.applyAwarenessUpdate(entry.awareness, update, ws)
        for (const id of entry.awareness.getStates().keys()) {
          if (!before.has(id)) controlledIds.add(id)
        }
        // Relay to everyone else (sender excluded — it already has it).
        for (const conn of entry.conns) {
          if (conn !== ws && conn.readyState === WebSocket.OPEN) {
            const out = encoding.createEncoder()
            encoding.writeVarUint(out, messageAwareness)
            encoding.writeVarUint8Array(out, update)
            conn.send(encoding.toUint8Array(out), { binary: true })
          }
        }
      }
    } catch (e) {
      console.error('[collab] message error', e)
    }
  })

  ws.on('close', () => {
    clearInterval(pingTimer)
    entry.conns.delete(ws)
    if (controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(entry.awareness, Array.from(controlledIds), 'server')
    }
    console.log(`[collab] leave ${room} (${entry.conns.size} conns)`)
  })
  ws.on('error', () => { try { ws.close() } catch { /* noop */ } })
})

console.log(`Collab server listening on ws://localhost:${PORT} (auth: ${REQUIRE_AUTH ? 'jwt-required' : 'demo-token allowed'})`)

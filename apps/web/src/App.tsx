import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { HubConnection } from '@microsoft/signalr'
import {
  decryptText,
  deriveRoomKey,
  encryptText,
  type EncryptedText,
} from './lib/crypto'
import {
  connectToRoom,
  createConnection,
  disconnectFromRoom,
  sendClipboard,
} from './lib/realtime'

const codePattern = /^[A-Z0-9]{5}$/
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'

type RoomResponse = { roomCode: string; salt: string }

function App() {
  const [roomCode, setRoomCode] = useState('')
  const [activeRoom, setActiveRoom] = useState<RoomResponse | null>(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('Ready when you are')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const connectionRef = useRef<HubConnection | null>(null)
  const keyRef = useRef<CryptoKey | null>(null)

  useEffect(() => {
    return () => {
      if (connectionRef.current && activeRoom) {
        void disconnectFromRoom(connectionRef.current, activeRoom.roomCode)
      }
    }
  }, [activeRoom])

  async function enterRoom(response: RoomResponse) {
    setBusy(true)
    setError('')
    setStatus('Opening secure room...')

    try {
      const key = await deriveRoomKey(response.roomCode, response.salt)
      const connection = createConnection()

      const receiveClipboard = async (payload: EncryptedText) => {
        try {
          setText(await decryptText(key, payload))
          setStatus('Synced just now')
        } catch {
          setError('This update could not be decrypted.')
        }
      }

      connection.on('ClipboardUpdated', receiveClipboard)
      connection.on('ClipboardSnapshot', receiveClipboard)

      connection.onreconnecting(() => setStatus('Reconnecting...'))
      connection.onreconnected(() => setStatus('Connected'))
      connection.onclose(() => setStatus('Disconnected'))

      await connectToRoom(connection, response.roomCode)
      connectionRef.current = connection
      keyRef.current = key
      setActiveRoom(response)
      setRoomCode(response.roomCode)
      setStatus('Connected securely')
    } catch {
      setError('Could not connect to that room. Is the server running?')
      setStatus('Connection failed')
    } finally {
      setBusy(false)
    }
  }

  async function createRoom() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/rooms`, { method: 'POST' })
      if (!response.ok) throw new Error('Room creation failed')
      await enterRoom((await response.json()) as RoomResponse)
    } catch {
      setError('Could not create a room. Is the server running?')
      setBusy(false)
    }
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault()
    const normalizedCode = roomCode.trim().toUpperCase()
    if (!codePattern.test(normalizedCode)) {
      setError('Room codes are exactly five letters or numbers.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/rooms/${normalizedCode}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Room join failed')
      await enterRoom((await response.json()) as RoomResponse)
    } catch {
      setError('That room is unavailable. Check the code and try again.')
      setBusy(false)
    }
  }

  async function updateText(nextText: string) {
    setText(nextText)
    if (!activeRoom || !connectionRef.current || !keyRef.current) return

    try {
      await sendClipboard(
        connectionRef.current,
        activeRoom.roomCode,
        await encryptText(keyRef.current, nextText),
      )
      setStatus('Synced just now')
    } catch {
      setStatus('Waiting to reconnect')
    }
  }

  async function pasteFromClipboard() {
    try {
      await updateText(await navigator.clipboard.readText())
    } catch {
      setError('Clipboard access was blocked. Paste directly into the editor instead.')
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('Copied to clipboard')
    } catch {
      setError('Clipboard access was blocked. Select the text and copy it manually.')
    }
  }

  if (activeRoom) {
    return (
      <main className="min-h-screen bg-[#10110f] px-5 py-6 text-[#e8e5df] sm:px-8 sm:py-8">
        <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-5xl flex-col">
          <header className="flex items-center justify-between border-b border-white/10 pb-6">
            <button className="text-xl font-semibold tracking-[-0.04em]" onClick={() => window.location.reload()}>
              paste<span className="text-[#d2f36b]">room</span>
            </button>
            <div className="flex items-center gap-2 text-xs text-[#989c91]">
              <span className="h-2 w-2 rounded-full bg-[#d2f36b] shadow-[0_0_12px_#d2f36b]" />
              {status}
            </div>
          </header>

          <section className="flex flex-1 flex-col py-10 sm:py-16">
            <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#989c91]">Private room</p>
                <h1 className="text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">Your shared clipboard.</h1>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-left sm:text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#989c91]">Room code</p>
                <p className="font-mono text-2xl font-bold tracking-[0.18em] text-[#d2f36b]">{activeRoom.roomCode}</p>
              </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#191b17] shadow-2xl shadow-black/20">
              <textarea
                value={text}
                onChange={(event) => void updateText(event.target.value)}
                placeholder="Paste or type something here..."
                className="min-h-[360px] flex-1 resize-none bg-transparent p-6 text-lg leading-8 text-[#f1f0eb] outline-none placeholder:text-[#62675d] sm:p-8 sm:text-xl"
                autoFocus
              />
              <div className="flex flex-col gap-4 border-t border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs text-[#777d70]">Encrypted in your browser before it leaves this device.</p>
                <div className="flex gap-2">
                  <button onClick={() => void pasteFromClipboard()} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-[#d5d8ce] transition hover:border-white/25 hover:bg-white/5">Paste</button>
                  <button onClick={() => void copyToClipboard()} className="rounded-xl bg-[#d2f36b] px-4 py-2.5 text-sm font-semibold text-[#171a12] transition hover:bg-[#e0fa8d]">Copy text</button>
                </div>
              </div>
            </div>
            {error && <p className="mt-4 text-sm text-[#ff9d8c]">{error}</p>}
          </section>
          <footer className="flex justify-between border-t border-white/10 pt-5 text-xs text-[#777d70]"><span>Room data lives while devices are connected.</span><span>End-to-end encrypted</span></footer>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#10110f] px-5 py-6 text-[#e8e5df] sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <div className="text-xl font-semibold tracking-[-0.04em]">paste<span className="text-[#d2f36b]">room</span></div>
          <div className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[#989c91]">Text only · Alpha</div>
        </header>
        <section className="relative flex flex-1 items-center py-16">
          <div className="pointer-events-none absolute -right-32 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-[#d2f36b]/10 blur-3xl" />
          <div className="relative grid w-full gap-14 lg:grid-cols-[1fr_400px] lg:items-center">
            <div>
              <p className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#989c91]"><span className="h-px w-8 bg-[#d2f36b]" />Send text. Not screenshots.</p>
              <h1 className="max-w-3xl text-6xl font-semibold leading-[0.93] tracking-[-0.08em] text-white sm:text-8xl">A quieter way to move words.</h1>
              <p className="mt-8 max-w-lg text-base leading-7 text-[#989c91] sm:text-lg">A temporary clipboard room for the moments when your phone and laptop need to talk. No accounts. No history. Just a code and your text.</p>
              <div className="mt-10 flex flex-wrap gap-3 text-xs text-[#777d70]"><span className="rounded-full border border-white/10 px-3 py-2">Browser encrypted</span><span className="rounded-full border border-white/10 px-3 py-2">Live sync</span><span className="rounded-full border border-white/10 px-3 py-2">No storage</span></div>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-[#191b17] p-6 shadow-2xl shadow-black/30 sm:p-8">
              <div className="mb-8"><p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#989c91]">Enter a room</p><h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Continue with a code.</h2></div>
              <form onSubmit={(event) => void joinRoom(event)}>
                <label htmlFor="room-code" className="mb-2 block text-xs font-medium text-[#989c91]">5-character room code</label>
                <input id="room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} placeholder="A7K2Q" maxLength={5} className="mb-3 w-full rounded-xl border border-white/10 bg-[#10110f] px-4 py-4 font-mono text-2xl tracking-[0.2em] text-white outline-none transition placeholder:text-[#454a41] focus:border-[#d2f36b]/60" />
                {error && <p className="mb-3 text-sm text-[#ff9d8c]">{error}</p>}
                <button type="submit" disabled={busy || !codePattern.test(roomCode)} className="w-full rounded-xl bg-[#d2f36b] px-5 py-3.5 font-semibold text-[#171a12] transition hover:bg-[#e0fa8d] disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Connecting...' : 'Join room'}</button>
              </form>
              <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-[#62675d]"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
              <button onClick={() => void createRoom()} disabled={busy} className="w-full rounded-xl border border-white/10 px-5 py-3.5 font-semibold text-[#d5d8ce] transition hover:border-[#d2f36b]/50 hover:bg-white/5 disabled:opacity-40">Create a new room</button>
              <p className="mt-6 text-center text-xs leading-5 text-[#62675d]">Anyone with the code can join. Use a private code for anything sensitive.</p>
            </div>
          </div>
        </section>
        <footer className="flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-[#777d70] sm:flex-row sm:justify-between"><span>Built for the space between your devices.</span><span>Rooms are temporary and memory-only.</span></footer>
      </div>
    </main>
  )
}

export default App

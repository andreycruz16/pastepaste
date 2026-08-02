import { useEffect, useRef, useState } from 'react'
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

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'

type RoomResponse = { roomCode: string; salt: string }

function roomCodeFromPath() {
  const match = window.location.pathname.match(/^\/([A-Za-z0-9]{5})\/?$/)
  return match?.[1].toUpperCase() ?? null
}

function App() {
  const [activeRoom, setActiveRoom] = useState<RoomResponse | null>(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('Opening...')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [unavailableCode, setUnavailableCode] = useState<string | null>(null)
  const activeRoomRef = useRef<RoomResponse | null>(null)
  const connectionRef = useRef<HubConnection | null>(null)
  const keyRef = useRef<CryptoKey | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function start() {
      setBusy(true)
      setError('')

      try {
        const code = roomCodeFromPath()
        setUnavailableCode(code)
        let response: RoomResponse

        if (code) {
          const roomResponse = await fetch(`${apiUrl}/api/rooms/${code}/claim`, {
            method: 'POST',
          })
          if (!roomResponse.ok) throw new Error('Unavailable')
          response = (await roomResponse.json()) as RoomResponse
        } else if (window.location.pathname === '/') {
          const roomResponse = await fetch(`${apiUrl}/api/rooms`, { method: 'POST' })
          if (!roomResponse.ok) throw new Error('Creation failed')
          response = (await roomResponse.json()) as RoomResponse
        } else {
          throw new Error('Invalid link')
        }

        if (!cancelled) await enterRoom(response)
      } catch {
        if (!cancelled) {
          setError('This link is unavailable. Open the root URL to create a new one.')
          setStatus('Unable to connect')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    void start()
    return () => {
      cancelled = true
      if (connectionRef.current && activeRoomRef.current) {
        void disconnectFromRoom(connectionRef.current, activeRoomRef.current.roomCode)
      }
    }
  }, [])

  useEffect(() => {
    if (activeRoom) textareaRef.current?.focus()
  }, [activeRoom])

  async function createNewRoom() {
    setBusy(true)
    setError('')
    setStatus('Creating...')

    try {
      const roomResponse = await fetch(`${apiUrl}/api/rooms`, { method: 'POST' })
      if (!roomResponse.ok) throw new Error('Creation failed')
      await enterRoom((await roomResponse.json()) as RoomResponse)
    } catch {
      setError('Could not create a new link. Please try again.')
      setStatus('Unable to connect')
    } finally {
      setBusy(false)
    }
  }

  async function recreateUnavailableRoom() {
    if (!unavailableCode) return

    setBusy(true)
    setError('')
    setStatus('Creating...')

    try {
      const roomResponse = await fetch(`${apiUrl}/api/rooms/${unavailableCode}/claim`, {
        method: 'POST',
      })

      if (!roomResponse.ok) throw new Error('Code unavailable')
      await enterRoom((await roomResponse.json()) as RoomResponse)
    } catch {
      setError('That code could not be used. Generate a new one instead.')
      setStatus('Unable to connect')
    } finally {
      setBusy(false)
    }
  }

  async function enterRoom(response: RoomResponse) {
    setStatus('Opening secure...')

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
    window.history.replaceState(null, '', `/${response.roomCode}`)
    activeRoomRef.current = response
    setActiveRoom(response)
    setStatus('Connected')
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

  async function copy(value: string, target: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(target)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setError('Could not copy. Please copy it manually instead.')
    }
  }

  if (!activeRoom) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f8f5] px-5 text-[#171a12]">
        <div className="w-full max-w-md text-center">
          <div className="mb-5 text-2xl font-bold tracking-[-0.055em] text-[#171a12]">
            paste<span className="text-[#78951d]">paste</span>
          </div>
          <p className="text-sm text-[#687064]">{busy ? status : error}</p>
          {!busy && unavailableCode && (
            <p className="mt-4 font-mono text-2xl font-bold tracking-[0.18em] text-[#78951d]">
              {unavailableCode}
            </p>
          )}
          {!busy && error && (
            <div className="mt-5 flex justify-center gap-2">
              {unavailableCode && (
                <button
                  onClick={() => void recreateUnavailableRoom()}
                  className="rounded-lg border border-black/10 px-4 py-2.5 text-sm font-semibold text-[#30372b] transition hover:border-[#a9c94f] hover:bg-white"
                >
                  Use this code
                </button>
              )}
              <button
                onClick={() => void createNewRoom()}
                className="rounded-lg bg-[#d2f36b] px-4 py-2.5 text-sm font-semibold text-[#171a12] transition hover:bg-[#bddd55]"
              >
                Generate new code
              </button>
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f8f8f5] px-5 py-6 text-[#171a12] sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-black/10 pb-6">
          <div className="text-2xl font-bold tracking-[-0.055em] text-[#171a12]">
            paste<span className="text-[#78951d]">paste</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#687064]">
            <span className="hidden sm:inline">{status}</span>
            <button
              onClick={() => void copy(window.location.href, 'link')}
              className="rounded-lg bg-[#d2f36b] px-3 py-2 font-semibold text-[#171a12] transition hover:bg-[#bddd55]"
            >
              {copied === 'link' ? 'Copied' : 'Share'}
            </button>
          </div>
        </header>

        <section className="flex flex-1 flex-col py-8 sm:py-12">
          <div className="mb-5 flex items-center justify-end gap-3">
            <p className="font-mono text-lg font-bold tracking-[0.18em] text-[#78951d]">{activeRoom.roomCode}</p>
            <button
              onClick={() => void copy(activeRoom.roomCode, 'code')}
              className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium text-[#30372b] transition hover:border-[#a9c94f] hover:bg-white"
            >
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-xl shadow-black/5">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => void updateText(event.target.value)}
              placeholder="Paste or type something here..."
              className="min-h-[60svh] flex-1 resize-none bg-transparent p-6 text-lg leading-8 text-[#20251d] outline-none placeholder:text-[#9da49a] sm:p-8 sm:text-xl"
              autoFocus
            />
            <div className="border-t border-black/10 px-6 py-4 text-xs text-[#7d8578]">
              Encrypted in your browser before it leaves this device.
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-[#b34739]">{error}</p>}
        </section>
      </div>
    </main>
  )
}

export default App

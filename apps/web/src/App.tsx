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

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-lg border border-black/10 p-2 text-[#30372b] transition hover:border-[#a9c94f] hover:bg-white dark:border-white/10 dark:text-[#d5d8ce] dark:hover:bg-white/5"
    >
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}

function App() {
  const [activeRoom, setActiveRoom] = useState<RoomResponse | null>(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('Opening...')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [unavailableCode, setUnavailableCode] = useState<string | null>(null)
  const [myName, setMyName] = useState<string | null>(null)
  const [participants, setParticipants] = useState<string[]>([])
  const [showParticipants, setShowParticipants] = useState(false)
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme')
    return stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

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
    setMyName(null)
    setParticipants([])
    setShowParticipants(false)

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
    connection.on('NameAssigned', (name: string) => {
      setMyName(name)
      sessionStorage.setItem(`pastepaste:name:${response.roomCode}`, name)
    })
    connection.on('ParticipantsUpdated', (names: string[]) => setParticipants(names))
    connection.onreconnecting(() => setStatus('Reconnecting...'))
    connection.onreconnected(() => setStatus('Connected'))
    connection.onclose(() => setStatus('Disconnected'))

    const preferredName = sessionStorage.getItem(`pastepaste:name:${response.roomCode}`) ?? ''
    await connectToRoom(connection, response.roomCode, preferredName)
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
      <main className="relative flex min-h-screen items-center justify-center bg-[#f8f8f5] px-5 text-[#171a12] dark:bg-[#10110f] dark:text-[#e8e5df]">
        <div className="absolute right-5 top-6">
          <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
        </div>
        <div className="w-full max-w-md text-center">
          <div className="mb-5 text-2xl font-bold tracking-[-0.055em] text-[#171a12] dark:text-[#e8e5df]">
            paste<span className="text-[#78951d] dark:text-[#d2f36b]">paste</span>
          </div>
          <p className="text-sm text-[#687064] dark:text-[#989c91]">{busy ? status : error}</p>
          {!busy && unavailableCode && (
            <p className="mt-4 font-mono text-2xl font-bold tracking-[0.18em] text-[#78951d] dark:text-[#d2f36b]">
              {unavailableCode}
            </p>
          )}
          {!busy && error && (
            <div className="mt-5 flex justify-center gap-2">
              {unavailableCode && (
                <button
                  onClick={() => void recreateUnavailableRoom()}
                  className="rounded-lg border border-black/10 px-4 py-2.5 text-sm font-semibold text-[#30372b] transition hover:border-[#a9c94f] hover:bg-white dark:border-white/10 dark:text-[#d5d8ce] dark:hover:bg-white/5"
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
    <main className="min-h-screen bg-[#f8f8f5] px-5 py-6 text-[#171a12] dark:bg-[#10110f] dark:text-[#e8e5df] sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-black/10 pb-6 dark:border-white/10">
          <div className="text-2xl font-bold tracking-[-0.055em] text-[#171a12] dark:text-[#e8e5df]">
            paste<span className="text-[#78951d] dark:text-[#d2f36b]">paste</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#687064] dark:text-[#989c91]">
            <span className="hidden sm:inline">{status}</span>
            {participants.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowParticipants((value) => !value)}
                  className="rounded-lg border border-black/10 px-3 py-2 font-medium text-[#30372b] transition hover:border-[#a9c94f] hover:bg-white dark:border-white/10 dark:text-[#d5d8ce] dark:hover:bg-white/5"
                >
                  {participants.length} {participants.length === 1 ? 'person' : 'people'}
                  <span className="ml-1 text-[#7d8578] dark:text-[#777d70]">{showParticipants ? '▴' : '▾'}</span>
                </button>
                {showParticipants && (
                  <div className="absolute right-0 top-full z-10 mt-2 min-w-48 rounded-xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-[#191b17]">
                    <ul className="space-y-1.5">
                      {participants.map((name) => (
                        <li
                          key={name}
                          className={
                            name === myName
                              ? 'font-semibold text-[#78951d] dark:text-[#d2f36b]'
                              : 'text-[#30372b] dark:text-[#d5d8ce]'
                          }
                        >
                          {name}
                          {name === myName && <span className="text-[#7d8578] dark:text-[#777d70]"> · you</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
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
            <p className="font-mono text-lg font-bold tracking-[0.18em] text-[#78951d] dark:text-[#d2f36b]">{activeRoom.roomCode}</p>
            <button
              onClick={() => void copy(activeRoom.roomCode, 'code')}
              className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium text-[#30372b] transition hover:border-[#a9c94f] hover:bg-white dark:border-white/10 dark:text-[#d5d8ce] dark:hover:bg-white/5"
            >
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-xl shadow-black/5 dark:border-white/10 dark:bg-[#191b17] dark:shadow-black/20">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => void updateText(event.target.value)}
              placeholder="Paste or type something here..."
              className="min-h-[60svh] flex-1 resize-none bg-transparent p-6 text-lg leading-8 text-[#20251d] outline-none placeholder:text-[#9da49a] dark:text-[#f1f0eb] dark:placeholder:text-[#62675d] sm:p-8 sm:text-xl"
              autoFocus
            />
            <div className="border-t border-black/10 px-6 py-4 text-xs text-[#7d8578] dark:border-white/10 dark:text-[#777d70]">
              Encrypted in your browser before it leaves this device.
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-[#b34739] dark:text-[#ff9d8c]">{error}</p>}
        </section>
        <footer className="flex items-center justify-center border-t border-black/10 pt-5 text-xs text-[#7d8578] dark:border-white/10 dark:text-[#777d70]">
          <span>Created by</span>
          <a
            href="https://github.com/andreycruz16"
            target="_blank"
            rel="noreferrer"
            className="ml-1 font-medium text-[#30372b] underline-offset-2 transition hover:underline dark:text-[#d5d8ce]"
          >
            andreycruz16
          </a>
        </footer>
      </div>
    </main>
  )
}

export default App

import { useEffect, useRef, useState } from 'react'

const ROOM_CODE_PATTERN =
  /^[BCDFGHJKLMNPRSTVWXYZ][AEIOU][BCDFGHJKLMNPRSTVWXYZ][AEIOU][BCDFGHJKLMNPRSTVWXYZ]$/

type Props = {
  onJoin: (code: string) => Promise<void>
  onClose: () => void
}

export default function JoinRoomModal({ onJoin, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const normalized = code
  const valid = ROOM_CODE_PATTERN.test(normalized)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function submit() {
    if (!valid || busy) return

    setBusy(true)
    setError('')
    try {
      await onJoin(normalized)
    } catch {
      setError('Could not join that room. Please check the code and try again.')
      setBusy(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === overlayRef.current) onClose()
      }}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-5"
      role="dialog"
      aria-modal="true"
      aria-label="Join a room"
    >
      <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-[#191b17]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#30372b] dark:text-[#d5d8ce]">Join a room</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-[#7d8578] transition hover:text-[#30372b] dark:text-[#777d70] dark:hover:text-[#d5d8ce]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <input
            ref={inputRef}
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5))
            }
            placeholder="TIGER"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-black/10 bg-[#f8f8f5] p-4 text-center font-mono text-2xl font-bold tracking-[0.2em] text-[#171a12] outline-none placeholder:text-[#9da49a] focus:border-[#a9c94f] dark:border-white/10 dark:bg-[#10110f] dark:text-[#e8e5df] dark:placeholder:text-[#62675d]"
          />
          {code.length > 0 && !valid && (
            <p className="mt-2 text-xs text-[#b34739] dark:text-[#ff9d8c]">
              Room codes are 5 letters, like TIGER.
            </p>
          )}
          {error && <p className="mt-2 text-xs text-[#b34739] dark:text-[#ff9d8c]">{error}</p>}
          <button
            type="submit"
            disabled={!valid || busy}
            className="mt-4 w-full rounded-lg bg-[#d2f36b] px-4 py-2.5 text-sm font-semibold text-[#171a12] transition hover:bg-[#bddd55] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Joining...' : 'Join room'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-[#7d8578] dark:text-[#777d70]">
          Ask the other person for their room code and type it here.
        </p>
      </div>
    </div>
  )
}

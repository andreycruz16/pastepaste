import { useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

type Props = {
  value: string
  onCopyLink: () => void
  onClose: () => void
}

export default function QRCodeModal({ value, onCopyLink, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === overlayRef.current) onClose()
      }}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-5"
      role="dialog"
      aria-modal="true"
      aria-label="Room QR code"
    >
      <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-[#191b17]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#30372b] dark:text-[#d5d8ce]">Join with your phone</h2>
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
        <div className="flex justify-center rounded-xl bg-white p-4">
          <QRCodeCanvas value={value} size={220} bgColor="#ffffff" fgColor="#171a12" />
        </div>
        <p className="mt-4 text-center font-mono text-sm font-semibold break-all text-[#78951d] dark:text-[#d2f36b]">
          {value}
        </p>
        <div className="mt-3 flex justify-center">
          <button
            onClick={onCopyLink}
            className="rounded-lg bg-[#d2f36b] px-3 py-1.5 text-xs font-semibold text-[#171a12] transition hover:bg-[#bddd55]"
          >
            Copy link
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-[#7d8578] dark:text-[#777d70]">
          Scan the code with your phone's camera to join this room.
        </p>
      </div>
    </div>
  )
}

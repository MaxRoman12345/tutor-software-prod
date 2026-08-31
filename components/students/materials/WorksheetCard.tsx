'use client'

import { type Worksheet } from '@/app/student/materials/actions'
import { type Progress, pctComplete, isComplete, pdfUrl, formatModule } from './types'
import { SegmentBar } from './SegmentBar'

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3">
      <path
        d="M5 10.5l3.5 3.5L15 7"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0">
      <path
        d="M3 2a1 1 0 011-1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0">
      <path
        d="M8 2v8M5 7l3 3 3-3M3 13h10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

async function downloadPdf(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  }
}

function PdfButtons({ qpUrl, msUrl, label }: { qpUrl: string | null; msUrl: string | null; label: string }) {
  if (!qpUrl && !msUrl) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-neutral-100">
      {qpUrl && (
        <>
          <button
            onClick={() => window.open(qpUrl, '_blank')}
            className="text-[11px] text-neutral-500 hover:text-neutral-900 transition flex items-center gap-1"
          >
            <FileIcon />
            QP
          </button>
          <button
            onClick={() => downloadPdf(qpUrl, `${label} QP.pdf`)}
            className="text-[11px] text-neutral-400 hover:text-neutral-900 transition flex items-center"
          >
            <ArrowDownIcon />
          </button>
        </>
      )}

      {qpUrl && msUrl && (
        <span className="text-neutral-200 text-xs select-none">|</span>
      )}

      {msUrl && (
        <>
          <button
            onClick={() => window.open(msUrl, '_blank')}
            className="text-[11px] text-neutral-500 hover:text-neutral-900 transition flex items-center gap-1"
          >
            <FileIcon />
            MS
          </button>
          <button
            onClick={() => downloadPdf(msUrl, `${label} MS.pdf`)}
            className="text-[11px] text-neutral-400 hover:text-neutral-900 transition flex items-center"
          >
            <ArrowDownIcon />
          </button>
        </>
      )}
    </div>
  )
}

export function worksheetTitle(w: Worksheet) {
  return w.topic_name ?? `${formatModule(w.module)} worksheet`
}

export function WorksheetCard({
  worksheet,
  progress,
  onOpen,
}: {
  worksheet: Worksheet
  /** Omit to render the card without any progress indicator (tutor browse view). */
  progress?: Progress
  onOpen: () => void
}) {
  const complete = progress ? isComplete(progress) : false
  const qpUrl = pdfUrl(worksheet.qp_path)
  const msUrl = pdfUrl(worksheet.ms_path)
  const title = worksheetTitle(worksheet)
  const label = `${formatModule(worksheet.module)} ${title}`.trim()

  return (
    <div
      className={`rounded-xl border transition flex flex-col ${complete
        ? 'border-emerald-500/40 bg-emerald-50/30'
        : 'border-neutral-200/80'
        }`}
    >
      <button
        onClick={onOpen}
        className="text-left p-4 hover:bg-neutral-50/80 transition rounded-t-xl flex-1"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-neutral-900 leading-snug">
            {title}
          </span>
          {progress &&
            (complete ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shrink-0">
                <CheckIcon />
              </span>
            ) : (
              <span className="text-xs font-mono text-neutral-400 shrink-0">
                {pctComplete(progress)}%
              </span>
            ))}
        </div>

        <span className="block text-xs text-neutral-400 mt-1 mb-2.5 truncate">
          {formatModule(worksheet.module)}
        </span>

        {progress && <SegmentBar progress={progress} thin />}
      </button>

      <PdfButtons qpUrl={qpUrl} msUrl={msUrl} label={label} />
    </div>
  )
}

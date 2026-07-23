'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getPapers,
  getQuestionsForPaper,
  getAllProgress,
  getMyExamBoard,
  type Outcome,
  type Paper,
  type PaperProgress,
  type QuestionRow,
} from './actions'
import { programmeFilter } from '@/lib/programme'
import {
  type Progress,
  EMPTY,
  isComplete,
  formatModule,
  uniq,
  pdfUrl,
} from '@/components/students/materials/types'
import { FilterRow } from '@/components/students/materials/FilterRow'
import { PaperCard } from '@/components/students/materials/PaperCard'
import { PaperStats } from '@/components/students/materials/PaperStats'
import { CompletionBanner } from '@/components/students/materials/CompletionBanner'
import { MarkingKey } from '@/components/students/materials/MarkingKey'
import { QuestionTableHeader } from '@/components/students/materials/QuestionTableHeader'
import { QuestionRowItem } from '@/components/students/materials/QuestionRowItem'

const SPEC_LABEL: Record<string, string> = { NEW_SPEC: 'New spec', OLD_SPEC: 'Old spec' }

function sumProgress(papers: Paper[], progress: Record<string, PaperProgress>): Progress {
  return papers.reduce<Progress>(
    (acc, p) => {
      const pr = progress[p.id]
      if (!pr) return acc
      return {
        total: acc.total + pr.total,
        correct: acc.correct + pr.correct,
        partial: acc.partial + pr.partial,
        incorrect: acc.incorrect + pr.incorrect,
      }
    },
    { ...EMPTY }
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

export default function MaterialsPage() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [progress, setProgress] = useState<Record<string, PaperProgress>>({})
  const [loading, setLoading] = useState(true)
  const [board, setBoard] = useState<string | null>(null)
  const [spec, setSpec] = useState<string | null>(null)
  const [module, setModule] = useState<string | null>(null)
  const [openPaper, setOpenPaper] = useState<Paper | null>(null)
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [qLoading, setQLoading] = useState(false)
  const [examBoard, setExamBoard] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getPapers(), getAllProgress(), getMyExamBoard()]).then(
      ([p, pr, eb]) => {
        setPapers(p)
        setProgress(pr)
        setExamBoard(eb)
        setLoading(false)
      }
    )
  }, [])

  const boards = useMemo(() => uniq(papers.map((p) => p.exam_board)), [papers])

  // Reuses programmeFilter so this highlights by exactly the same rule the
  // dashboard and tutor views use to decide a student's programme.
  const inProgramme = useMemo(() => {
    const filter = programmeFilter(examBoard)
    return (b: string) => filter(b, '')
  }, [examBoard])

  // Only dampen once we know their board — with none set every board matches,
  // and dimming nothing is the right outcome.
  const myBoard = useMemo(
    () => (examBoard ? boards.find(inProgramme) ?? null : null),
    [examBoard, boards, inProgramme]
  )
  const specs = useMemo(
    () => uniq(papers.filter((p) => p.exam_board === board).map((p) => p.spec_level)),
    [papers, board]
  )
  const modules = useMemo(
    () =>
      uniq(
        papers
          .filter((p) => p.exam_board === board && p.spec_level === spec)
          .map((p) => p.module)
      ),
    [papers, board, spec]
  )
  const years = useMemo(
    () =>
      papers.filter(
        (p) => p.exam_board === board && p.spec_level === spec && p.module === module
      ),
    [papers, board, spec, module]
  )

  const progressForBoard = (b: string) =>
    sumProgress(papers.filter((p) => p.exam_board === b), progress)
  const progressForSpec = (s: string) =>
    sumProgress(
      papers.filter((p) => p.exam_board === board && p.spec_level === s),
      progress
    )
  const progressForModule = (m: string) =>
    sumProgress(
      papers.filter(
        (p) => p.exam_board === board && p.spec_level === spec && p.module === m
      ),
      progress
    )

  const openYear = async (paper: Paper) => {
    setOpenPaper(paper)
    setQLoading(true)
    setQuestions(await getQuestionsForPaper(paper.id))
    setQLoading(false)
  }

  const markQuestion = (questionId: string, outcome: Outcome | null) => {
    const previous = questions.find((q) => q.id === questionId)?.outcome ?? null
    setQuestions((qs) => qs.map((q) => (q.id === questionId ? { ...q, outcome } : q)))
    if (!openPaper) return
    setProgress((prev) => {
      const current = prev[openPaper.id]
      if (!current) return prev
      const next = { ...current }
      if (previous) next[previous]--
      if (outcome) next[outcome]++
      return { ...prev, [openPaper.id]: next }
    })
  }

  const noteChanged = (questionId: string, note: string | null) => {
    setQuestions((qs) => qs.map((q) => (q.id === questionId ? { ...q, note } : q)))
  }

  if (loading) {
    return (
      <p className="text-sm text-neutral-400 py-12 text-center">
        Loading materials…
      </p>
    )
  }

  if (openPaper) {
    const paperProgress: Progress = {
      total: questions.length,
      correct: questions.filter((q) => q.outcome === 'correct').length,
      partial: questions.filter((q) => q.outcome === 'partial').length,
      incorrect: questions.filter((q) => q.outcome === 'incorrect').length,
    }
    const qpUrl = pdfUrl(openPaper.qp_path)
    const msUrl = pdfUrl(openPaper.ms_path)
    const paperLabel = `${openPaper.exam_board ?? ''} ${formatModule(openPaper.module)} ${openPaper.paper_year ?? ''}`.trim()

    return (
      <div>
        <button
          onClick={() => setOpenPaper(null)}
          className="text-sm text-neutral-500 hover:text-neutral-900 transition mb-5"
        >
          ← Back to papers
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            {openPaper.exam_board} {formatModule(openPaper.module)} · {openPaper.paper_year}
          </h1>

          {(qpUrl || msUrl) && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {qpUrl && (
                <>
                  <button
                    onClick={() => window.open(qpUrl, '_blank')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-xs text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition"
                  >
                    <FileIcon />
                    View QP
                  </button>
                  <button
                    onClick={() => downloadPdf(qpUrl, `${paperLabel} QP.pdf`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-xs text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition"
                  >
                    <ArrowDownIcon />
                    QP
                  </button>
                </>
              )}
              {msUrl && (
                <>
                  <button
                    onClick={() => window.open(msUrl, '_blank')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-xs text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition"
                  >
                    <FileIcon />
                    View MS
                  </button>
                  <button
                    onClick={() => downloadPdf(msUrl, `${paperLabel} MS.pdf`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-xs text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition"
                  >
                    <ArrowDownIcon />
                    MS
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {qLoading ? (
          <p className="text-sm text-neutral-400 py-12 text-center">
            Loading questions…
          </p>
        ) : questions.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200/80 p-10 text-center">
            <p className="text-sm text-neutral-400">
              No questions logged for this paper yet.
            </p>
          </div>
        ) : (
          <>
            {isComplete(paperProgress) && (
              <CompletionBanner progress={paperProgress} />
            )}
            <PaperStats progress={paperProgress} />
            <MarkingKey />
            <div className="rounded-2xl border border-neutral-200/80 overflow-hidden">
              <QuestionTableHeader />
              {questions.map((q) => (
                <QuestionRowItem
                  key={q.id}
                  question={q}
                  onMark={markQuestion}
                  onNoteChange={noteChanged}
                />
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mb-6">
        Materials
      </h1>

      <div className="space-y-5">
        <FilterRow
          label="Exam board"
          hint={myBoard ? `${myBoard} is your programme` : undefined}
          options={boards}
          selected={board}
          onSelect={(v) => {
            setBoard(v)
            setSpec(null)
            setModule(null)
          }}
          progressFor={progressForBoard}
          inProgramme={myBoard ? inProgramme : undefined}
        />
        {board && (
          <FilterRow
            label="Specification"
            options={specs}
            selected={spec}
            onSelect={(v) => {
              setSpec(v)
              setModule(null)
            }}
            format={(v) => SPEC_LABEL[v] ?? v}
            progressFor={progressForSpec}
          />
        )}
        {spec && (
          <FilterRow
            label="Module"
            options={modules}
            selected={module}
            onSelect={setModule}
            format={formatModule}
            progressFor={progressForModule}
          />
        )}
      </div>

      {module && (
        <div className="mt-8">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-medium">Papers</h2>
            <span className="text-xs font-mono text-neutral-400">
              {years.length} available
            </span>
          </div>
          {years.length === 0 ? (
            <p className="text-sm text-neutral-400 py-8 text-center">
              No papers found for this combination.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {years.map((p) => (
                <PaperCard
                  key={p.id}
                  paper={p}
                  progress={progress[p.id] ?? EMPTY}
                  onOpen={() => openYear(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!board && (
        <p className="text-sm text-neutral-400 mt-10 text-center">
          Pick an exam board to get started.
        </p>
      )}
    </div>
  )
}
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteHomework,
  type HomeworkItem,
} from '@/app/tutor/students/[student_id]/homework-actions'
import {
  getQuestionsForPaper,
  type Outcome,
  type QuestionRow,
} from '@/app/student/materials/actions'
import { SegmentBar } from '@/components/students/materials/SegmentBar'
import { PaperLink } from '@/components/students/materials/PaperLink'
import { QuestionTableHeader } from '@/components/students/materials/QuestionTableHeader'
import { QuestionRowItem } from '@/components/students/materials/QuestionRowItem'
import { ChevronIcon } from '@/components/students/materials/icons'

const OUTCOME_PILL: Record<string, string> = {
  correct: 'bg-emerald-500 text-white',
  partial: 'bg-amber-500 text-white',
  incorrect: 'bg-red-500 text-white',
}
const OUTCOME_LABEL: Record<string, string> = {
  correct: 'Correct',
  partial: 'Partial',
  incorrect: 'Incorrect',
}

function Difficulty({ level }: { level: number | null }) {
  if (level == null) return <span className="text-xs text-neutral-300 w-16 text-right shrink-0">-</span>
  const colours = ['bg-emerald-500', 'bg-amber-500', 'bg-red-500']
  return (
    <span className="flex items-center gap-1 w-16 justify-end shrink-0" title={`Difficulty ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-3 rounded-full ${i <= level ? colours[level - 1] : 'bg-neutral-200'}`}
        />
      ))}
    </span>
  )
}

/** Read-only row for the tutor's view — marking belongs to the student only. */
function ReadOnlyQuestionRow({ question: q }: { question: QuestionRow }) {
  return (
    <div className="flex items-center gap-4 px-4 sm:px-5 py-3 sm:py-3.5 border-t border-neutral-100">
      <span className="font-mono text-sm text-neutral-900 w-8 sm:w-12 shrink-0">
        {q.question_number ?? '-'}
      </span>
      <span className="text-sm text-neutral-700 truncate flex-1 min-w-0">
        {q.topics?.topic ?? 'Untagged'}
      </span>
      {q.outcome && (
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${OUTCOME_PILL[q.outcome]}`}
        >
          {OUTCOME_LABEL[q.outcome]}
        </span>
      )}
      <Difficulty level={q.difficulty} />
    </div>
  )
}

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0
}

function dueLabel(h: HomeworkItem) {
  if (h.daysUntilDue === null) return null
  if (h.status === 'complete') return `due ${h.dueLabel}`
  if (h.daysUntilDue < 0) {
    const d = Math.abs(h.daysUntilDue)
    return `${d}d overdue`
  }
  if (h.daysUntilDue === 0) return 'due today'
  if (h.daysUntilDue === 1) return 'due tomorrow'
  return `due in ${h.daysUntilDue}d`
}

const STATUS_STYLE: Record<HomeworkItem['status'], string> = {
  complete: 'bg-emerald-500 text-white',
  in_progress: 'bg-amber-500 text-white',
  not_started: 'bg-neutral-200 text-neutral-600',
}
const STATUS_LABEL: Record<HomeworkItem['status'], string> = {
  complete: 'Done',
  in_progress: 'Started',
  not_started: 'Not started',
}

export function HomeworkList({
  homework,
  studentId,
  canDelete = false,
}: {
  homework: HomeworkItem[]
  studentId: string
  canDelete?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [questionsByPaper, setQuestionsByPaper] = useState<Record<string, QuestionRow[]>>({})
  const [loadingPapers, setLoadingPapers] = useState<Set<string>>(new Set())

  if (homework.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/80 p-8 text-center">
        <p className="text-sm text-neutral-400">No homework set yet - Set homework when logging a lesson.</p>
      </div>
    )
  }

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await deleteHomework(id, studentId)
      if (res.error) console.error(res.error)
      else router.refresh()
    })
  }

  const toggleExpand = (h: HomeworkItem) => {
    const opening = expandedId !== h.id
    setExpandedId(opening ? h.id : null)

    if (opening) {
      const toLoad = h.papers.filter((p) => !(p.ppId in questionsByPaper))
      if (toLoad.length > 0) {
        setLoadingPapers((prev) => new Set([...prev, ...toLoad.map((p) => p.ppId)]))
        toLoad.forEach((p) => {
          getQuestionsForPaper(p.ppId, studentId).then((rows) => {
            setQuestionsByPaper((prev) => ({ ...prev, [p.ppId]: rows }))
            setLoadingPapers((prev) => {
              const next = new Set(prev)
              next.delete(p.ppId)
              return next
            })
          })
        })
      }
    } else {
      // resync the summary cards (Set/Completed/Overdue/Accuracy) now that
      // marks made while expanded may have changed them.
      router.refresh()
    }
  }

  const markQuestion = (ppId: string, questionId: string, outcome: Outcome | null) => {
    setQuestionsByPaper((prev) => ({
      ...prev,
      [ppId]: (prev[ppId] ?? []).map((q) => (q.id === questionId ? { ...q, outcome } : q)),
    }))
  }

  const noteChanged = (ppId: string, questionId: string, note: string | null) => {
    setQuestionsByPaper((prev) => ({
      ...prev,
      [ppId]: (prev[ppId] ?? []).map((q) => (q.id === questionId ? { ...q, note } : q)),
    }))
  }

  const complete = homework.filter((h) => h.status === 'complete').length
  const overdue = homework.filter((h) => h.overdue).length
  const totCorrect = homework.reduce((a, h) => a + h.correct, 0)
  const totMarked = homework.reduce((a, h) => a + h.marked, 0)

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="rounded-2xl border border-neutral-200/80 px-4 py-2.5 flex-1">
          <p className="text-xs text-neutral-500">Set</p>
          <p className="text-xl font-semibold font-mono">{homework.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200/80 px-4 py-2.5 flex-1">
          <p className="text-xs text-neutral-500">Completed</p>
          <p className="text-xl font-semibold font-mono">
            {complete}
            <span className="text-xs text-neutral-300">/{homework.length}</span>
          </p>
        </div>
        <div
          className={`rounded-2xl border px-4 py-2.5 flex-1 ${overdue > 0 ? 'border-red-200 bg-red-50' : 'border-neutral-200/80'
            }`}
        >
          <p className={`text-xs ${overdue > 0 ? 'text-red-600' : 'text-neutral-500'}`}>
            Overdue
          </p>
          <p
            className={`text-xl font-semibold font-mono ${overdue > 0 ? 'text-red-600' : ''}`}
          >
            {overdue}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200/80 px-4 py-2.5 flex-1">
          <p className="text-xs text-neutral-500">Accuracy</p>
          <p className="text-xl font-semibold font-mono">
            {totMarked > 0 ? `${pct(totCorrect, totMarked)}%` : '-'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/80 divide-y divide-neutral-100">
        {homework.map((h) => {
          const due = dueLabel(h)
          const open = expandedId === h.id
          return (
            <div
              key={h.id}
              onClick={() => toggleExpand(h)}
              className={`px-4 py-3 cursor-pointer hover:bg-neutral-50/80 transition ${pending ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[h.status]}`}
                >
                  {STATUS_LABEL[h.status]}
                </span>
                <span className="text-sm font-medium text-neutral-900 truncate">
                  {h.title}
                </span>
                <span className="text-[11px] font-mono text-neutral-300 shrink-0">
                  set {h.assignedLabel}
                </span>
                <div className="flex-1" />
                {due && (
                  <span
                    className={`text-[11px] font-mono shrink-0 ${h.overdue ? 'text-red-500' : 'text-neutral-400'
                      }`}
                  >
                    {due}
                  </span>
                )}
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(h.id)
                    }}
                    className="text-[11px] text-neutral-300 hover:text-red-500 transition shrink-0"
                  >
                    Delete
                  </button>
                )}
                <ChevronIcon open={open} />
              </div>

              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 max-w-sm">
                  <SegmentBar
                    progress={{
                      total: h.total,
                      correct: h.correct,
                      partial: h.partial,
                      incorrect: h.incorrect,
                    }}
                    thin
                  />
                </div>
                <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                  {h.marked}/{h.total}
                </span>
                {h.marked > 0 && (
                  <span className="text-[11px] font-mono text-neutral-300 shrink-0">
                    {pct(h.correct, h.marked)}% correct
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1 mt-2">
                {h.papers.map((p) => (
                  <span
                    key={p.ppId}
                    className="text-[11px] px-1.5 py-0.5 rounded-full border border-neutral-200 text-neutral-500"
                  >
                    <PaperLink label={p.label} qpPath={p.qpPath} msPath={p.msPath} />
                  </span>
                ))}
              </div>

              {h.notes && (
                <p className="text-[11px] text-neutral-500 mt-1.5 border-l-2 border-neutral-200 pl-2">
                  {h.notes}
                </p>
              )}

              {open && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mt-3 pt-3 border-t border-neutral-100 space-y-4 cursor-auto"
                >
                  {h.papers.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-2">
                      No materials attached to this homework.
                    </p>
                  ) : (
                    h.papers.map((p) => {
                      const rows = questionsByPaper[p.ppId]
                      const paperLoading = loadingPapers.has(p.ppId)
                      return (
                        <div key={p.ppId}>
                          <PaperLink
                            label={p.label}
                            qpPath={p.qpPath}
                            msPath={p.msPath}
                            className="text-xs font-medium text-neutral-700"
                          />
                          <div className="mt-2 rounded-xl border border-neutral-200/80 overflow-hidden">
                            {paperLoading || !rows ? (
                              <p className="text-xs text-neutral-400 py-4 text-center">
                                Loading questions…
                              </p>
                            ) : rows.length === 0 ? (
                              <p className="text-xs text-neutral-400 py-4 text-center">
                                No questions logged for this paper yet.
                              </p>
                            ) : (
                              <>
                                <QuestionTableHeader />
                                {rows.map((q) =>
                                  canDelete ? (
                                    <ReadOnlyQuestionRow key={q.id} question={q} />
                                  ) : (
                                    <QuestionRowItem
                                      key={q.id}
                                      question={q}
                                      onMark={(id, outcome) => markQuestion(p.ppId, id, outcome)}
                                      onNoteChange={(id, note) => noteChanged(p.ppId, id, note)}
                                    />
                                  )
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-neutral-300 px-1">
        Progress updates automatically as questions are marked in Materials.
      </p>
    </div>
  )
}
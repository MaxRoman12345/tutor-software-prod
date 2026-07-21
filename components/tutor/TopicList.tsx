'use client'

import { useState } from 'react'
import type {
  TopicStats,
  DifficultyStats,
  CompletedQuestion,
} from '@/app/student/dashboard/actions'
import { ChevronIcon } from '@/components/students/materials/icons'
import { PaperLink } from '@/components/students/materials/PaperLink'

const SECTION_ORDER = ['Pure Mathematics', 'Statistics', 'Mechanics']
const DIFF_LABEL: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }
const DIFF_DOT: Record<number, string> = {
  1: 'bg-emerald-500',
  2: 'bg-amber-500',
  3: 'bg-red-500',
}
const OUTCOME_ICON: Record<string, string> = {
  correct: '✓',
  partial: '~',
  incorrect: '✗',
}
const OUTCOME_COLOR: Record<string, string> = {
  correct: 'text-emerald-600',
  partial: 'text-amber-600',
  incorrect: 'text-red-500',
}

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0
}
function attempted(d: DifficultyStats) {
  return d.correct + d.partial + d.incorrect
}

/** Dense, tutor-facing version of the student's topic grid. */
export function TopicList({ topics }: { topics: TopicStats[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (topics.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/80 p-8 text-center">
        <p className="text-sm text-neutral-400">No questions in this programme yet.</p>
      </div>
    )
  }

  const grouped = new Map<string, TopicStats[]>()
  for (const t of topics) {
    const s = SECTION_ORDER.includes(t.section_course) ? t.section_course : 'Other'
    if (!grouped.has(s)) grouped.set(s, [])
    grouped.get(s)!.push(t)
  }
  const ordered = [...grouped.entries()].sort(
    (a, b) =>
      (SECTION_ORDER.indexOf(a[0]) + 1 || 99) - (SECTION_ORDER.indexOf(b[0]) + 1 || 99)
  )

  return (
    <div className="space-y-3">
      {ordered.map(([section, list]) => (
        <div key={section}>
          <p className="text-xs text-neutral-400 mb-1.5">{section}</p>
          <div className="rounded-xl border border-neutral-200/80 divide-y divide-neutral-100">
            {list.map((t) => {
              const total =
                t.difficulty[1].total + t.difficulty[2].total + t.difficulty[3].total
              const att =
                attempted(t.difficulty[1]) +
                attempted(t.difficulty[2]) +
                attempted(t.difficulty[3])
              const correct =
                t.difficulty[1].correct +
                t.difficulty[2].correct +
                t.difficulty[3].correct
              const partial =
                t.difficulty[1].partial +
                t.difficulty[2].partial +
                t.difficulty[3].partial
              const incorrect =
                t.difficulty[1].incorrect +
                t.difficulty[2].incorrect +
                t.difficulty[3].incorrect
              const open = openId === t.id

              return (
                <div key={t.id}>
                  <button
                    onClick={() => setOpenId(open ? null : t.id)}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-3 hover:bg-neutral-50 transition"
                  >
                    <span className="flex gap-0.5 shrink-0">
                      {([1, 2, 3] as const).map((d) => {
                        const a = attempted(t.difficulty[d])
                        const tot = t.difficulty[d].total
                        return (
                          <span
                            key={d}
                            className={`h-1.5 w-1.5 rounded-full ${tot > 0 && a === tot
                              ? DIFF_DOT[d]
                              : a > 0
                                ? `${DIFF_DOT[d]} opacity-40`
                                : 'bg-neutral-200'
                              }`}
                            title={`${DIFF_LABEL[d]}: ${a}/${tot}`}
                          />
                        )
                      })}
                    </span>

                    <span className="text-xs text-neutral-700 flex-1 min-w-0 truncate">
                      {t.topic}
                    </span>

                    <span className="flex items-center gap-1.5 font-mono text-[11px] shrink-0">
                      <span className="text-emerald-600 w-4 text-right">{correct}</span>
                      <span className="text-amber-600 w-4 text-right">{partial}</span>
                      <span className="text-red-500 w-4 text-right">{incorrect}</span>
                    </span>

                    <div className="hidden sm:block w-20 h-1.5 rounded-full bg-neutral-100 overflow-hidden shrink-0">
                      <div className="flex h-full">
                        {correct > 0 && (
                          <div
                            className="bg-emerald-500"
                            style={{ width: `${pct(correct, total)}%` }}
                          />
                        )}
                        {partial > 0 && (
                          <div
                            className="bg-amber-500"
                            style={{ width: `${pct(partial, total)}%` }}
                          />
                        )}
                        {incorrect > 0 && (
                          <div
                            className="bg-red-500"
                            style={{ width: `${pct(incorrect, total)}%` }}
                          />
                        )}
                      </div>
                    </div>

                    <span className="text-[11px] font-mono text-neutral-400 w-12 text-right shrink-0">
                      {att}/{total}
                    </span>

                    <ChevronIcon open={open} />
                  </button>

                  {open && (
                    <div className="px-3 pb-2.5 pt-1 bg-neutral-50/50 space-y-2">
                      {([1, 2, 3] as const).map((d) => {
                        const stats = t.difficulty[d]
                        if (stats.total === 0) return null
                        return (
                          <div key={d}>
                            <p className="text-[11px] text-neutral-400 mb-0.5">
                              {DIFF_LABEL[d]} · {attempted(stats)}/{stats.total}
                            </p>
                            {stats.papers.map((p) => (
                              <div key={p.id} className="text-[11px] text-neutral-600">
                                <PaperLink
                                  label={p.label}
                                  qpPath={p.qpPath}
                                  msPath={p.msPath}
                                  className="text-neutral-500"
                                />
                                {p.completed.length > 0 && (
                                  <span className="ml-2">
                                    {p.completed.map((q: CompletedQuestion, i) => (
                                      <span
                                        key={q.number}
                                        className={`font-mono ${OUTCOME_COLOR[q.outcome]}`}
                                      >
                                        {i > 0 && (
                                          <span className="text-neutral-300">, </span>
                                        )}
                                        Q{q.number}
                                        {OUTCOME_ICON[q.outcome]}
                                      </span>
                                    ))}
                                  </span>
                                )}
                                {p.unattempted.length > 0 && (
                                  <span className="ml-2 text-neutral-300">
                                    left:{' '}
                                    <span className="font-mono">
                                      Q{p.unattempted.join(', Q')}
                                    </span>
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
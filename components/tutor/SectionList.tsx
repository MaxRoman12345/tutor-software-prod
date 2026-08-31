'use client'

import type { StudentSection } from '@/app/tutor/students/[student_id]/actions'
import { WORKSHEET_BOARD } from '@/lib/programme'
import { formatModule } from '@/components/students/materials/types'
import { SegmentBar } from '@/components/students/materials/SegmentBar'

const SPEC_LABEL: Record<string, string> = {
  NEW_SPEC: 'New spec',
  OLD_SPEC: 'Old spec',
}

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0
}

export function SectionList({ sections }: { sections: StudentSection[] }) {
  if (sections.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/80 p-8 text-center">
        <p className="text-sm text-neutral-400">
          No papers in this student&apos;s programme yet.
        </p>
      </div>
    )
  }

  // sections arrive pre-sorted: board → new spec first → module
  const groups: { label: string; sections: StudentSection[] }[] = []
  for (const s of sections) {
    const spec = s.specLevel ? SPEC_LABEL[s.specLevel] ?? s.specLevel : ''
    const label =
      s.examBoard === WORKSHEET_BOARD
        ? 'Worksheets'
        : `${s.examBoard ?? '?'} · ${spec}`
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.sections.push(s)
    else groups.push({ label, sections: [s] })
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="text-xs text-neutral-400 mb-1.5">{g.label}</p>
          <div className="rounded-xl border border-neutral-200/80 divide-y divide-neutral-100">
            {g.sections.map((s) => {
              const marked = s.correct + s.partial + s.incorrect
              const empty = s.total === 0

              return (
                <div key={s.key} className="px-3 py-1.5 flex items-center gap-3">
                  <span className="text-xs text-neutral-700 w-32 shrink-0 truncate">
                    {formatModule(s.module)}
                  </span>

                  <span className="text-[11px] font-mono text-neutral-300 w-6 shrink-0">
                    {s.papers}p
                  </span>

                  <div className="flex-1 min-w-0">
                    {empty ? (
                      <div className="h-1.5 rounded-full bg-neutral-100" />
                    ) : (
                      <SegmentBar
                        progress={{
                          total: s.total,
                          correct: s.correct,
                          partial: s.partial,
                          incorrect: s.incorrect,
                        }}
                        thin
                      />
                    )}
                  </div>

                  <span className="text-[11px] font-mono text-neutral-400 w-14 text-right shrink-0">
                    {empty ? 'no qs' : `${marked}/${s.total}`}
                  </span>

                  <span className="text-[11px] font-mono text-neutral-900 w-8 text-right shrink-0">
                    {empty ? '' : `${pct(marked, s.total)}%`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
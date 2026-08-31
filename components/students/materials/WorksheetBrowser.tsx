'use client'

import { useMemo } from 'react'
import { type Worksheet } from '@/app/student/materials/actions'
import { WORKSHEET_MODULES } from '@/lib/programme'
import { type Progress, EMPTY, formatModule } from './types'
import { WorksheetCard } from './WorksheetCard'

/**
 * All worksheets on one page, grouped by module (Pure / Statistics /
 * Mechanics) with a small header per group. Modules with no worksheets are
 * skipped; anything with an unrecognised module falls into "Other".
 */
export function WorksheetBrowser({
  worksheets,
  progressFor,
  onOpen,
}: {
  worksheets: Worksheet[]
  /** Omit for a browse view with no per-worksheet progress (tutor). */
  progressFor?: (id: string) => Progress
  onOpen: (w: Worksheet) => void
}) {
  const groups = useMemo(() => {
    const order = [...WORKSHEET_MODULES] as string[]
    const byModule = new Map<string, Worksheet[]>()
    for (const w of worksheets) {
      const key = w.module && order.includes(w.module) ? w.module : 'OTHER'
      if (!byModule.has(key)) byModule.set(key, [])
      byModule.get(key)!.push(w)
    }
    const keys = [...byModule.keys()].sort((a, b) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    return keys.map((k) => ({ module: k, worksheets: byModule.get(k)! }))
  }, [worksheets])

  if (worksheets.length === 0) {
    return (
      <p className="text-sm text-neutral-400 py-8 text-center">
        No worksheets available yet.
      </p>
    )
  }

  return (
    <div className="mt-8 space-y-8">
      {groups.map((g) => (
        <section key={g.module}>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              {g.module === 'OTHER' ? 'Other' : formatModule(g.module)}
            </h2>
            <span className="text-xs font-mono text-neutral-400">
              {g.worksheets.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {g.worksheets.map((w) => (
              <WorksheetCard
                key={w.id}
                worksheet={w}
                progress={progressFor ? progressFor(w.id) ?? EMPTY : undefined}
                onOpen={() => onOpen(w)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

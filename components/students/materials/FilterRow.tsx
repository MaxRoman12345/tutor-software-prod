import { Progress, pctComplete, isComplete } from './types'

export function FilterRow({
  label,
  options,
  selected,
  onSelect,
  format,
  progressFor,
}: {
  label: string
  options: string[]
  selected: string | null
  onSelect: (v: string) => void
  format?: (v: string) => string
  progressFor?: (v: string) => Progress
}) {
  return (
    <div>
      <p className="text-xs text-neutral-500 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.length === 0 ? (
          <span className="text-sm text-neutral-300">None available</span>
        ) : (
          options.map((o) => {
            const prog = progressFor?.(o)
            const active = selected === o
            const complete = prog ? isComplete(prog) : false

            return (
              <button
                key={o}
                onClick={() => onSelect(o)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition ${active
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
                  }`}
              >
                <span>{format ? format(o) : o}</span>
                {prog && prog.total > 0 && (
                  <span
                    className={`text-xs font-mono ${active
                        ? 'text-neutral-400'
                        : complete
                          ? 'text-emerald-600'
                          : 'text-neutral-400'
                      }`}
                  >
                    {complete ? '✓' : `${pctComplete(prog)}%`}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
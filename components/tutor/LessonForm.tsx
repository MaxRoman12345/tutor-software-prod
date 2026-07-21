'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createLesson,
  updateLesson,
  type Lesson,
  type TopicOption,
  type PaperOption,
} from '@/app/tutor/students/[student_id]/lesson-actions'
import { PaperPicker } from './PaperPicker'

const SELECT =
  'text-sm rounded-xl border border-neutral-200/80 bg-white px-3 py-1.5 text-neutral-700 focus:outline-none focus:ring-1 focus:ring-emerald-500'

function isoDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

type DraftTopic = { topicId: string; minutes: string }

/** Serves both "log a lesson" and "edit this lesson" - pass `existing` to edit. */
export function LessonForm({
  studentId,
  topicOptions,
  paperOptions,
  suggestedPaperIds = [],
  existing = null,
  onDone,
  onCancel,
}: {
  studentId: string
  topicOptions: TopicOption[]
  paperOptions: PaperOption[]
  suggestedPaperIds?: string[]
  existing?: Lesson | null
  onDone: () => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [date, setDate] = useState(existing?.date ?? isoDays(0))
  const [duration, setDuration] = useState(
    existing?.durationMinutes != null ? String(existing.durationMinutes) : '60'
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [topics, setTopics] = useState<DraftTopic[]>(
    existing && existing.topics.length > 0
      ? existing.topics.map((t) => ({
        topicId: t.topicId,
        minutes: t.minutes != null ? String(t.minutes) : '',
      }))
      : [{ topicId: '', minutes: '' }]
  )
  const [paperIds, setPaperIds] = useState<string[]>(
    existing?.papers.map((p) => p.ppId) ?? []
  )

  const hw = existing?.homework ?? null
  const [hwOpen, setHwOpen] = useState(!!hw)
  const [hwTitle, setHwTitle] = useState(hw?.title ?? '')
  const [hwNotes, setHwNotes] = useState(hw?.notes ?? '')
  const [hwDue, setHwDue] = useState(hw?.dueDate ?? isoDays(7))
  const [hwPaperIds, setHwPaperIds] = useState<string[]>(hw?.paperIds ?? [])

  const save = () => {
    const chosen = topics.filter((t) => t.topicId)
    if (chosen.length === 0) {
      setError('Pick at least one topic.')
      return
    }
    const seen = new Set<string>()
    for (const t of chosen) {
      if (seen.has(t.topicId)) {
        setError('That topic is listed twice.')
        return
      }
      seen.add(t.topicId)
    }
    if (hwOpen && !hwTitle.trim()) {
      setError('Give the homework a title, or remove it.')
      return
    }

    setError(null)
    const payload = {
      studentId,
      date,
      durationMinutes: duration ? Number(duration) : null,
      notes,
      topics: chosen.map((t) => ({
        topicId: t.topicId,
        minutes: t.minutes ? Number(t.minutes) : null,
      })),
      paperIds,
      homework: hwOpen
        ? { title: hwTitle, notes: hwNotes, dueDate: hwDue || null, paperIds: hwPaperIds }
        : null,
    }

    startTransition(async () => {
      const res = existing
        ? await updateLesson({ ...payload, lessonId: existing.id })
        : await createLesson(payload)
      if (res.error) {
        setError(res.error)
        return
      }
      onDone()
      router.refresh()
    })
  }

  const sections = [...new Set(topicOptions.map((t) => t.section))]

  return (
    <div className="rounded-2xl border border-neutral-300 p-4">
      {existing && (
        <p className="text-xs font-medium text-neutral-700 mb-3">Editing lesson</p>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={SELECT}
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Length (mins)</label>
          <input
            type="number"
            min="0"
            step="5"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={`${SELECT} w-24 font-mono`}
          />
        </div>
      </div>

      <label className="block text-xs text-neutral-500 mb-1.5">Topics covered</label>
      <div className="space-y-2 mb-4">
        {topics.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={t.topicId}
              onChange={(e) =>
                setTopics((prev) =>
                  prev.map((p, j) => (j === i ? { ...p, topicId: e.target.value } : p))
                )
              }
              className={`${SELECT} flex-1 min-w-0`}
            >
              <option value="">Select a topic…</option>
              {sections.map((s) => (
                <optgroup key={s} label={s}>
                  {topicOptions
                    .filter((o) => o.section === s)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.topic}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="5"
              placeholder="mins"
              value={t.minutes}
              onChange={(e) =>
                setTopics((prev) =>
                  prev.map((p, j) => (j === i ? { ...p, minutes: e.target.value } : p))
                )
              }
              className={`${SELECT} w-20 font-mono shrink-0`}
            />
            {topics.length > 1 && (
              <button
                onClick={() => setTopics((prev) => prev.filter((_, j) => j !== i))}
                className="text-neutral-300 hover:text-red-500 transition text-sm px-1 shrink-0"
                title="Remove"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setTopics((prev) => [...prev, { topicId: '', minutes: '' }])}
          className="text-xs text-neutral-500 hover:text-neutral-900 transition"
        >
          + Add topic
        </button>
      </div>

      <label className="block text-xs text-neutral-500 mb-1.5">Materials used</label>
      <div className="mb-4">
        <PaperPicker
          options={paperOptions}
          selected={paperIds}
          onChange={setPaperIds}
          suggestedIds={suggestedPaperIds}
        />
      </div>

      <label className="block text-xs text-neutral-500 mb-1.5">Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="What was covered, how they got on, what to follow up…"
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm resize-y focus:outline-none focus:border-neutral-400 mb-3"
      />

      <div className="border-t border-neutral-100 pt-3 mb-3">
        {!hwOpen ? (
          <button
            onClick={() => setHwOpen(true)}
            className="text-xs text-neutral-500 hover:text-neutral-900 transition"
          >
            + Set homework
          </button>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-700">Homework</span>
              <button
                onClick={() => setHwOpen(false)}
                className="text-[11px] text-neutral-300 hover:text-red-500 transition"
              >
                Remove
              </button>
            </div>

            <div className="flex items-end gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-neutral-500 mb-1">Title</label>
                <input
                  value={hwTitle}
                  onChange={(e) => setHwTitle(e.target.value)}
                  placeholder="e.g. Pure 1 differentiation practice"
                  className={`${SELECT} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Due</label>
                <input
                  type="date"
                  value={hwDue}
                  onChange={(e) => setHwDue(e.target.value)}
                  className={SELECT}
                />
              </div>
            </div>

            <label className="block text-xs text-neutral-500 mb-1.5">
              Papers to complete
            </label>
            <div className="mb-2">
              <PaperPicker
                options={paperOptions}
                selected={hwPaperIds}
                onChange={setHwPaperIds}
                suggestedIds={suggestedPaperIds}
              />
            </div>

            <textarea
              value={hwNotes}
              onChange={(e) => setHwNotes(e.target.value)}
              rows={2}
              placeholder="Instructions for the student…"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm resize-y focus:outline-none focus:border-neutral-400"
            />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="text-sm px-3 py-1.5 rounded-full bg-neutral-900 text-white hover:bg-neutral-700 transition disabled:opacity-50"
        >
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Save lesson'}
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-neutral-500 hover:text-neutral-900 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
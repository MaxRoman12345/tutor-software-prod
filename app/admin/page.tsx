'use client'

import { useEffect, useState } from 'react'
import {
  getAdminData,
  assignStudentToTutor,
  unassignStudent,
  type AdminData,
  type AdminStudent,
  type AdminTutor,
} from './actions'

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    getAdminData().then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <p className="text-sm text-neutral-400 py-12 text-center">Loading…</p>
    )
  }

  if (!data) return null

  const tutorCounts = new Map<string, number>()
  for (const s of data.students) {
    if (s.tutor) tutorCounts.set(s.tutor.id, (tutorCounts.get(s.tutor.id) ?? 0) + 1)
  }

  async function handleAssign(studentId: string, tutorId: string) {
    if (!tutorId) {
      handleUnassign(studentId)
      return
    }
    setSavingId(studentId)
    const tutor = data!.tutors.find((t) => t.id === tutorId) ?? null
    setData((prev) =>
      prev
        ? {
          ...prev,
          students: prev.students.map((s) =>
            s.id === studentId ? { ...s, tutor } : s
          ),
        }
        : prev
    )
    const { error } = await assignStudentToTutor(studentId, tutorId)
    if (error) console.error(error)
    setSavingId(null)
  }

  async function handleUnassign(studentId: string) {
    setSavingId(studentId)
    setData((prev) =>
      prev
        ? {
          ...prev,
          students: prev.students.map((s) =>
            s.id === studentId ? { ...s, tutor: null } : s
          ),
        }
        : prev
    )
    const { error } = await unassignStudent(studentId)
    if (error) console.error(error)
    setSavingId(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs text-neutral-400 mb-0.5">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight">Students &amp; tutors</h1>
        </div>
        <div className="flex gap-3 text-xs font-mono text-neutral-400 shrink-0">
          <span>{data.students.length} students</span>
          <span>·</span>
          <span>{data.tutors.length} tutors</span>
        </div>
      </div>

      {data.tutors.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {data.tutors.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-full border border-neutral-200/80 px-3 py-1.5 text-xs"
            >
              <span className="font-medium text-neutral-700">
                {t.name ?? t.email}
              </span>
              <span className="font-mono text-neutral-400">
                {tutorCounts.get(t.id) ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-neutral-200/80 divide-y divide-neutral-100">
        {data.students.map((s) => (
          <StudentRow
            key={s.id}
            student={s}
            tutors={data.tutors}
            saving={savingId === s.id}
            onAssign={(tutorId) => handleAssign(s.id, tutorId)}
          />
        ))}

        {data.students.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-10">
            No students yet.
          </p>
        )}
      </div>
    </div>
  )
}

function StudentRow({
  student,
  tutors,
  saving,
  onAssign,
}: {
  student: AdminStudent
  tutors: AdminTutor[]
  saving: boolean
  onAssign: (tutorId: string) => void
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900 truncate">
          {student.name ?? student.email ?? 'Unnamed student'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-neutral-400 truncate">{student.email}</p>
          {student.exam_board && (
            <span className="text-[11px] font-mono text-neutral-400">
              · {student.exam_board}
            </span>
          )}
        </div>
      </div>

      <select
        value={student.tutor?.id ?? ''}
        onChange={(e) => onAssign(e.target.value)}
        disabled={saving}
        className="text-sm rounded-xl border border-neutral-200/80 bg-white px-3 py-1.5 text-neutral-700 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        <option value="">Unassigned</option>
        {tutors.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name ?? t.email}
          </option>
        ))}
      </select>
    </div>
  )
}
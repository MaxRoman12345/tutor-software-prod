"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/server";

export type HomeworkPaper = {
  /** Source id — a past_paper id, or a worksheet id when isWorksheet. */
  ppId: string;
  isWorksheet: boolean;
  label: string;
  qpPath: string | null;
  msPath: string | null;
};

export type HomeworkItem = {
  id: string;
  title: string;
  notes: string | null;
  assignedLabel: string;
  dueLabel: string | null;
  /** Days until due. Negative = overdue. Null if no due date. */
  daysUntilDue: number | null;
  papers: HomeworkPaper[];
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
  marked: number;
  status: "not_started" | "in_progress" | "complete";
  overdue: boolean;
};

function formatModule(m: string | null) {
  if (!m) return "";
  return m
    .split("_")
    .map((part) =>
      /^[A-Z]{1,2}\d$/.test(part)
        ? part
        : part.charAt(0) + part.slice(1).toLowerCase(),
    )
    .join(" ");
}

function dateLabel(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

export async function getHomework(studentId: string): Promise<HomeworkItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("homework")
    .select(
      `id, title, notes, assigned_date, due_date,
       homework_papers ( pp_id, worksheet_id,
         past_paper ( exam_board, module, paper_year, qp_path, ms_path ),
         worksheets ( module, topic_name, qp_path, ms_path ) )`,
    )
    .eq("student_id", studentId)
    .order("assigned_date", { ascending: false });

  if (error) {
    console.error("getHomework error:", error);
    return [];
  }

  type Row = {
    id: string;
    title: string;
    notes: string | null;
    assigned_date: string;
    due_date: string | null;
    homework_papers: {
      pp_id: string | null;
      worksheet_id: string | null;
      past_paper: {
        exam_board: string | null;
        module: string | null;
        paper_year: string | null;
        qp_path: string | null;
        ms_path: string | null;
      } | null;
      worksheets: {
        module: string | null;
        topic_name: string | null;
        qp_path: string | null;
        ms_path: string | null;
      } | null;
    }[];
  };

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  const paperIds = [
    ...new Set(
      rows.flatMap((r) =>
        (r.homework_papers ?? [])
          .map((p) => p.pp_id)
          .filter((id): id is string => !!id),
      ),
    ),
  ];
  const worksheetIds = [
    ...new Set(
      rows.flatMap((r) =>
        (r.homework_papers ?? [])
          .map((p) => p.worksheet_id)
          .filter((id): id is string => !!id),
      ),
    ),
  ];

  // Progress is derived, not stored: every question in an attached paper or
  // worksheet counts toward the homework, using whatever the student marked in
  // Materials.
  const [paperQs, worksheetQs] = await Promise.all([
    paperIds.length > 0
      ? supabase.from("questions").select("id, pp_id").in("pp_id", paperIds)
      : Promise.resolve({ data: [], error: null }),
    worksheetIds.length > 0
      ? supabase
          .from("questions")
          .select("id, worksheet_id")
          .in("worksheet_id", worksheetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (paperQs.error) console.error("getHomework paper questions:", paperQs.error);
  if (worksheetQs.error)
    console.error("getHomework worksheet questions:", worksheetQs.error);

  // keyed by source id (paper or worksheet)
  const questionsByPaper = new Map<string, string[]>();
  for (const q of (paperQs.data ?? []) as { id: string; pp_id: string | null }[]) {
    if (!q.pp_id) continue;
    if (!questionsByPaper.has(q.pp_id)) questionsByPaper.set(q.pp_id, []);
    questionsByPaper.get(q.pp_id)!.push(q.id);
  }
  for (const q of (worksheetQs.data ?? []) as {
    id: string;
    worksheet_id: string | null;
  }[]) {
    if (!q.worksheet_id) continue;
    if (!questionsByPaper.has(q.worksheet_id))
      questionsByPaper.set(q.worksheet_id, []);
    questionsByPaper.get(q.worksheet_id)!.push(q.id);
  }

  // Only the questions these homeworks actually cover — reading the student's
  // whole progress table here used to hit PostgREST's 1000-row cap and report
  // completed questions as unmarked.
  const questionIds = [
    ...(paperQs.data ?? []).map((q) => q.id),
    ...(worksheetQs.data ?? []).map((q) => q.id),
  ];

  const progressRes = await supabase
    .from("student_question_progress")
    .select("question_id, outcome")
    .eq("student_id", studentId)
    .in("question_id", questionIds);

  if (progressRes.error)
    console.error("getHomework progress:", progressRes.error);

  const outcomeFor = new Map(
    (progressRes.data ?? []).map((p) => [p.question_id, p.outcome as string]),
  );

  const today = new Date();
  const todayUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  return rows.map((r) => {
    let total = 0;
    let correct = 0;
    let partial = 0;
    let incorrect = 0;

    for (const hp of r.homework_papers ?? []) {
      const sourceId = hp.pp_id ?? hp.worksheet_id;
      if (!sourceId) continue;
      for (const qid of questionsByPaper.get(sourceId) ?? []) {
        total++;
        const o = outcomeFor.get(qid);
        if (o === "correct") correct++;
        else if (o === "partial") partial++;
        else if (o === "incorrect") incorrect++;
      }
    }

    const marked = correct + partial + incorrect;
    const complete = total > 0 && marked === total;

    let daysUntilDue: number | null = null;
    if (r.due_date) {
      const [y, m, d] = r.due_date.split("-").map(Number);
      daysUntilDue = Math.round((Date.UTC(y, m - 1, d) - todayUTC) / 86400000);
    }

    return {
      id: r.id,
      title: r.title,
      notes: r.notes,
      assignedLabel: dateLabel(r.assigned_date),
      dueLabel: r.due_date ? dateLabel(r.due_date) : null,
      daysUntilDue,
      papers: (r.homework_papers ?? []).map((hp) => {
        const ws = hp.worksheets;
        return {
          ppId: (hp.pp_id ?? hp.worksheet_id) as string,
          isWorksheet: !!hp.worksheet_id,
          label: hp.past_paper
            ? `${hp.past_paper.exam_board ?? ""} ${formatModule(hp.past_paper.module)} ${hp.past_paper.paper_year ?? ""}`.trim()
            : ws
              ? `${formatModule(ws.module)} · ${ws.topic_name ?? "Worksheet"}`.trim()
              : "Unknown material",
          qpPath: hp.past_paper?.qp_path ?? ws?.qp_path ?? null,
          msPath: hp.past_paper?.ms_path ?? ws?.ms_path ?? null,
        };
      }),
      total,
      correct,
      partial,
      incorrect,
      marked,
      status: complete
        ? "complete"
        : marked > 0
          ? "in_progress"
          : "not_started",
      overdue: !complete && daysUntilDue !== null && daysUntilDue < 0,
    };
  });
}

export async function deleteHomework(homeworkId: string, studentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("homework")
    .delete()
    .eq("id", homeworkId);

  if (error) {
    console.error("deleteHomework error:", error);
    return { error: error.message };
  }

  revalidatePath(`/tutor/students/${studentId}`);
  revalidatePath("/student/homework");
  return { error: null };
}

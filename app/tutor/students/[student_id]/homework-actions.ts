"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/server";

export type HomeworkPaper = {
  ppId: string;
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
       homework_papers ( pp_id, past_paper ( exam_board, module, paper_year, qp_path, ms_path ) )`,
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
      pp_id: string;
      past_paper: {
        exam_board: string | null;
        module: string | null;
        paper_year: string | null;
        qp_path: string | null;
        ms_path: string | null;
      } | null;
    }[];
  };

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  const allPaperIds = [
    ...new Set(
      rows.flatMap((r) => (r.homework_papers ?? []).map((p) => p.pp_id)),
    ),
  ];

  // Progress is derived, not stored: every question in an attached paper counts
  // toward the homework, using whatever the student marked in Materials.
  const questionsRes =
    allPaperIds.length > 0
      ? await supabase
          .from("questions")
          .select("id, pp_id")
          .in("pp_id", allPaperIds)
      : { data: [], error: null };

  if (questionsRes.error)
    console.error("getHomework questions:", questionsRes.error);

  const questionsByPaper = new Map<string, string[]>();
  for (const q of questionsRes.data ?? []) {
    if (!q.pp_id) continue;
    if (!questionsByPaper.has(q.pp_id)) questionsByPaper.set(q.pp_id, []);
    questionsByPaper.get(q.pp_id)!.push(q.id);
  }

  // Only the questions these homeworks actually cover — reading the student's
  // whole progress table here used to hit PostgREST's 1000-row cap and report
  // completed questions as unmarked.
  const questionIds = (questionsRes.data ?? []).map((q) => q.id);

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
      for (const qid of questionsByPaper.get(hp.pp_id) ?? []) {
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
      papers: (r.homework_papers ?? []).map((hp) => ({
        ppId: hp.pp_id,
        label: hp.past_paper
          ? `${hp.past_paper.exam_board ?? ""} ${formatModule(hp.past_paper.module)} ${hp.past_paper.paper_year ?? ""}`.trim()
          : "Unknown paper",
        qpPath: hp.past_paper?.qp_path ?? null,
        msPath: hp.past_paper?.ms_path ?? null,
      })),
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

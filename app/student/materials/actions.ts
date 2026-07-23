"use server";

import { createClient } from "@/lib/server";
import { fetchAllRows } from "@/lib/fetch-all";

export type Paper = {
  id: string;
  paper_year: string | null;
  exam_board: string | null;
  module: string | null;
  spec_level: "OLD_SPEC" | "NEW_SPEC" | null;
  qp_path: string | null;
  ms_path: string | null;
};

export type Outcome = "correct" | "partial" | "incorrect";

export type QuestionRow = {
  id: string;
  question_number: string | null;
  difficulty: number | null;
  topics: { topic: string | null; section_course: string | null } | null;
  outcome: Outcome | null;
  note: string | null;
};

export type PaperProgress = {
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
};

/** The signed-in student's exam board, used to highlight their own programme. */
export async function getMyExamBoard(): Promise<string | null> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("users")
    .select("exam_board")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("getMyExamBoard error:", error);
    return null;
  }
  return data?.exam_board ?? null;
}

export async function getPapers(): Promise<Paper[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("past_paper")
    .select("id, paper_year, exam_board, module, spec_level, qp_path, ms_path")
    .order("paper_year", { ascending: false });

  if (error) {
    console.error("getPapers error:", error);
    return [];
  }
  return data ?? [];
}

/**
 * studentId: optional. Omit for the logged-in student's own progress.
 * Pass a specific student's id (tutor view) to see their progress instead -
 * relies on RLS to enforce the caller is allowed to read that student's rows.
 */
export async function getAllProgress(
  studentId?: string,
): Promise<Record<string, PaperProgress>> {
  const supabase = await createClient();

  let targetId = studentId;
  if (!targetId) {
    const { data: claims } = await supabase.auth.getClaims();
    targetId = claims?.claims?.sub;
  }
  if (!targetId) return {};

  // Both are whole-table reads, so they have to be paged — see lib/fetch-all.ts.
  const [questions, progress] = await Promise.all([
    fetchAllRows<{ id: string; pp_id: string | null }>(
      "getAllProgress questions",
      (from, to) =>
        supabase.from("questions").select("id, pp_id").order("id").range(from, to),
    ),
    fetchAllRows<{ question_id: string; outcome: string | null }>(
      "getAllProgress progress",
      (from, to) =>
        supabase
          .from("student_question_progress")
          .select("question_id, outcome")
          .eq("student_id", targetId)
          .order("question_id")
          .range(from, to),
    ),
  ]);

  const outcomeFor = new Map(
    progress.map((p) => [p.question_id, p.outcome as Outcome]),
  );

  const byPaper: Record<string, PaperProgress> = {};

  for (const q of questions) {
    if (!q.pp_id) continue;
    byPaper[q.pp_id] ??= { total: 0, correct: 0, partial: 0, incorrect: 0 };
    byPaper[q.pp_id].total++;

    const outcome = outcomeFor.get(q.id);
    if (outcome === "correct") byPaper[q.pp_id].correct++;
    else if (outcome === "partial") byPaper[q.pp_id].partial++;
    else if (outcome === "incorrect") byPaper[q.pp_id].incorrect++;
  }

  return byPaper;
}

/**
 * studentId: optional, same convention as getAllProgress above.
 */
export async function getQuestionsForPaper(
  paperId: string,
  studentId?: string,
): Promise<QuestionRow[]> {
  const supabase = await createClient();

  let targetId = studentId;
  if (!targetId) {
    const { data: claims } = await supabase.auth.getClaims();
    targetId = claims?.claims?.sub;
  }

  const questionsRes = await supabase
    .from("questions")
    .select("id, question_number, difficulty, topics(topic, section_course)")
    .eq("pp_id", paperId);

  if (questionsRes.error) {
    console.error("getQuestionsForPaper error:", questionsRes.error);
    return [];
  }

  // Only this paper's questions — reading the student's whole progress table
  // here used to hit PostgREST's 1000-row cap and silently drop marks.
  const questionIds = (questionsRes.data ?? []).map((q) => q.id);

  const progressRes = await supabase
    .from("student_question_progress")
    .select("question_id, outcome, note")
    .eq("student_id", targetId)
    .in("question_id", questionIds);

  if (progressRes.error) console.error("progress error:", progressRes.error);

  const progressFor = new Map(
    (progressRes.data ?? []).map((p) => [p.question_id, p]),
  );

  const rows = (questionsRes.data ?? []).map((q) => {
    const p = progressFor.get(q.id);
    return {
      ...q,
      outcome: (p?.outcome as Outcome) ?? null,
      note: p?.note ?? null,
    };
  }) as unknown as QuestionRow[];

  return rows.sort((a, b) =>
    (a.question_number ?? "").localeCompare(
      b.question_number ?? "",
      undefined,
      {
        numeric: true,
        sensitivity: "base",
      },
    ),
  );
}

export async function setQuestionOutcome(questionId: string, outcome: Outcome) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const studentId = claims?.claims?.sub;
  if (!studentId) return { error: "Not signed in" };

  const { error } = await supabase.from("student_question_progress").upsert(
    {
      student_id: studentId,
      question_id: questionId,
      outcome,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,question_id" },
  );

  if (error) {
    console.error("setQuestionOutcome error:", error);
    return { error: error.message };
  }
  return { error: null };
}

export async function clearQuestionOutcome(questionId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const studentId = claims?.claims?.sub;
  if (!studentId) return { error: "Not signed in" };

  const { error } = await supabase.from("student_question_progress").upsert(
    {
      student_id: studentId,
      question_id: questionId,
      outcome: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,question_id" },
  );

  if (error) {
    console.error("clearQuestionOutcome error:", error);
    return { error: error.message };
  }
  return { error: null };
}

export async function setQuestionNote(questionId: string, note: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const studentId = claims?.claims?.sub;
  if (!studentId) return { error: "Not signed in" };

  const { error } = await supabase.from("student_question_progress").upsert(
    {
      student_id: studentId,
      question_id: questionId,
      note: note.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,question_id" },
  );

  if (error) {
    console.error("setQuestionNote error:", error);
    return { error: error.message };
  }
  return { error: null };
}

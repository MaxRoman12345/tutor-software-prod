"use server";

import { createClient } from "@/lib/server";
import { programmeFilter, WORKSHEET_BOARD } from "@/lib/programme";
import { fetchAllRows } from "@/lib/fetch-all";

export type Outcome = "correct" | "partial" | "incorrect";

export type StudentPaperQuestion = {
  id: string;
  questionNumber: string | null;
  difficulty: number | null;
  topic: string | null;
  outcome: Outcome | null;
  note: string | null;
};

export type StudentPaper = {
  id: string;
  examBoard: string | null;
  specLevel: string | null;
  module: string | null;
  /** For worksheets this holds the topic name rather than a year. */
  paperYear: string | null;
  qpPath: string | null;
  msPath: string | null;
  /** True when this row is a worksheet rather than a past paper. */
  isWorksheet: boolean;
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
  lastActivityLabel: string | null;
  questions: StudentPaperQuestion[];
};

export type StudentSection = {
  key: string;
  examBoard: string | null;
  specLevel: string | null;
  module: string | null;
  papers: number;
  papersStarted: number;
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
};

/**
 * Formatted server-side with an explicit timezone so the string is identical
 * on server and client - avoids hydration mismatch in a client component.
 */
function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

/**
 * One student's paper activity for the tutor view.
 *
 * - `sections`: EVERY board/spec/module in the student's programme, whether or
 *   not they've touched it - including ones with no questions tagged yet.
 * - `papers`: only papers they've actually marked something in, newest first.
 *
 * Relies on the tutor's RLS select policy on student_question_progress.
 */
export async function getStudentPapers(studentId: string): Promise<{
  papers: StudentPaper[];
  sections: StudentSection[];
}> {
  const supabase = await createClient();

  // questions and progress are whole-table reads, so they have to be paged —
  // see lib/fetch-all.ts.
  const [profileRes, papersRes, worksheetsRes, questionRows, progressRows] =
    await Promise.all([
    supabase.from("users").select("exam_board").eq("id", studentId).single(),
    supabase
      .from("past_paper")
      .select(
        "id, paper_year, exam_board, module, spec_level, qp_path, ms_path",
      ),
    supabase
      .from("worksheets")
      .select("id, module, topic_name, qp_path, ms_path"),
    fetchAllRows("getStudentPapers questions", (from, to) =>
      supabase
        .from("questions")
        .select("id, pp_id, worksheet_id, question_number, difficulty, topics(topic)")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<{
      question_id: string;
      outcome: string | null;
      note: string | null;
      updated_at: string;
    }>("getStudentPapers progress", (from, to) =>
      supabase
        .from("student_question_progress")
        .select("question_id, outcome, note, updated_at")
        .eq("student_id", studentId)
        .order("question_id")
        .range(from, to),
    ),
  ]);

  if (papersRes.error)
    console.error("getStudentPapers papers:", papersRes.error);

  const inProgramme = programmeFilter(profileRes.data?.exam_board ?? null);

  type QRow = {
    id: string;
    pp_id: string | null;
    worksheet_id: string | null;
    question_number: string | null;
    difficulty: number | null;
    topics: { topic: string | null } | null;
  };

  const questions = questionRows as unknown as QRow[];

  const progressFor = new Map(
    progressRows.map((p) => [
      p.question_id,
      {
        outcome: p.outcome as Outcome | null,
        note: p.note as string | null,
        updated_at: p.updated_at as string,
      },
    ]),
  );

  // keyed by source id — a paper id or a worksheet id
  const byPaper = new Map<string, QRow[]>();
  for (const q of questions) {
    const sourceId = q.pp_id ?? q.worksheet_id;
    if (!sourceId) continue;
    if (!byPaper.has(sourceId)) byPaper.set(sourceId, []);
    byPaper.get(sourceId)!.push(q);
  }

  const programmePapers = (papersRes.data ?? []).filter((p) =>
    inProgramme(p.exam_board ?? "", p.spec_level ?? ""),
  );

  const started: (StudentPaper & { lastActivity: string | null })[] = [];
  const sectionMap = new Map<string, StudentSection>();

  for (const p of programmePapers) {
    // every paper in the programme contributes to its section, even if it has
    // no questions tagged yet
    const sectionKey = `${p.exam_board ?? "?"}|${p.spec_level ?? "?"}|${p.module ?? "?"}`;
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, {
        key: sectionKey,
        examBoard: p.exam_board,
        specLevel: p.spec_level,
        module: p.module,
        papers: 0,
        papersStarted: 0,
        total: 0,
        correct: 0,
        partial: 0,
        incorrect: 0,
      });
    }
    const section = sectionMap.get(sectionKey)!;
    section.papers++;

    const qs = byPaper.get(p.id) ?? [];

    let correct = 0;
    let partial = 0;
    let incorrect = 0;
    let lastActivity: string | null = null;

    const rows: StudentPaperQuestion[] = qs.map((q) => {
      const pr = progressFor.get(q.id);
      const outcome = pr?.outcome ?? null;

      if (outcome === "correct") correct++;
      else if (outcome === "partial") partial++;
      else if (outcome === "incorrect") incorrect++;

      if (outcome && pr?.updated_at) {
        if (!lastActivity || pr.updated_at > lastActivity) {
          lastActivity = pr.updated_at;
        }
      }

      return {
        id: q.id,
        questionNumber: q.question_number,
        difficulty: q.difficulty,
        topic: q.topics?.topic ?? null,
        outcome,
        note: pr?.note ?? null,
      };
    });

    section.total += rows.length;
    section.correct += correct;
    section.partial += partial;
    section.incorrect += incorrect;

    const marked = correct + partial + incorrect;
    if (marked === 0) continue;

    section.papersStarted++;

    rows.sort((a, b) =>
      (a.questionNumber ?? "").localeCompare(
        b.questionNumber ?? "",
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        },
      ),
    );

    started.push({
      id: p.id,
      examBoard: p.exam_board,
      specLevel: p.spec_level,
      module: p.module,
      paperYear: p.paper_year,
      qpPath: p.qp_path,
      msPath: p.ms_path,
      isWorksheet: false,
      total: rows.length,
      correct,
      partial,
      incorrect,
      lastActivity,
      lastActivityLabel: lastActivity ? dateLabel(lastActivity) : null,
      questions: rows,
    });
  }

  // Worksheets are uni-board, so every student's programme includes all of
  // them. They surface under a single "Worksheets" board, one section per
  // module (Pure / Statistics / Mechanics).
  type WorksheetRow = {
    id: string;
    module: string | null;
    topic_name: string | null;
    qp_path: string | null;
    ms_path: string | null;
  };

  for (const w of (worksheetsRes.data ?? []) as WorksheetRow[]) {
    const sectionKey = `${WORKSHEET_BOARD}|-|${w.module ?? "?"}`;
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, {
        key: sectionKey,
        examBoard: WORKSHEET_BOARD,
        specLevel: null,
        module: w.module,
        papers: 0,
        papersStarted: 0,
        total: 0,
        correct: 0,
        partial: 0,
        incorrect: 0,
      });
    }
    const section = sectionMap.get(sectionKey)!;
    section.papers++;

    const qs = byPaper.get(w.id) ?? [];

    let correct = 0;
    let partial = 0;
    let incorrect = 0;
    let lastActivity: string | null = null;

    const rows: StudentPaperQuestion[] = qs.map((q) => {
      const pr = progressFor.get(q.id);
      const outcome = pr?.outcome ?? null;

      if (outcome === "correct") correct++;
      else if (outcome === "partial") partial++;
      else if (outcome === "incorrect") incorrect++;

      if (outcome && pr?.updated_at) {
        if (!lastActivity || pr.updated_at > lastActivity) {
          lastActivity = pr.updated_at;
        }
      }

      return {
        id: q.id,
        questionNumber: q.question_number,
        difficulty: q.difficulty,
        topic: q.topics?.topic ?? null,
        outcome,
        note: pr?.note ?? null,
      };
    });

    section.total += rows.length;
    section.correct += correct;
    section.partial += partial;
    section.incorrect += incorrect;

    const marked = correct + partial + incorrect;
    if (marked === 0) continue;

    section.papersStarted++;

    rows.sort((a, b) =>
      (a.questionNumber ?? "").localeCompare(b.questionNumber ?? "", undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    started.push({
      id: w.id,
      examBoard: WORKSHEET_BOARD,
      specLevel: null,
      module: w.module,
      paperYear: w.topic_name,
      qpPath: w.qp_path,
      msPath: w.ms_path,
      isWorksheet: true,
      total: rows.length,
      correct,
      partial,
      incorrect,
      lastActivity,
      lastActivityLabel: lastActivity ? dateLabel(lastActivity) : null,
      questions: rows,
    });
  }

  started.sort((a, b) =>
    (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""),
  );

  // new spec before old, then board, then module
  const sections = [...sectionMap.values()].sort((a, b) => {
    if (a.examBoard !== b.examBoard)
      return (a.examBoard ?? "").localeCompare(b.examBoard ?? "");
    if (a.specLevel !== b.specLevel) return a.specLevel === "NEW_SPEC" ? -1 : 1;
    return (a.module ?? "").localeCompare(b.module ?? "", undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return {
    papers: started.map(({ lastActivity: _drop, ...rest }) => rest),
    sections,
  };
}

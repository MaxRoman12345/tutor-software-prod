"use server";

import { createClient } from "@/lib/server";
import { programmeFilter } from "@/lib/programme";
import { fetchAllRows } from "@/lib/fetch-all";

export type CompletedQuestion = {
  number: string;
  outcome: "correct" | "partial" | "incorrect";
};

export type PaperEntry = {
  id: string;
  label: string;
  qpPath: string | null;
  msPath: string | null;
  unattempted: string[];
  completed: CompletedQuestion[];
};

export type DifficultyStats = {
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
  papers: PaperEntry[];
};

export type TopicStats = {
  id: string;
  topic: string;
  section_course: string;
  difficulty: {
    1: DifficultyStats;
    2: DifficultyStats;
    3: DifficultyStats;
  };
};

export type DashboardData = {
  name: string | null;
  email: string | null;
  exam_board: string | null;
  topics: TopicStats[];
  totalQuestions: number;
  totalAttempted: number;
};

function paperLabel(p: {
  exam_board: string | null;
  module: string | null;
  paper_year: string | null;
  spec_level: string | null;
}) {
  const mod = p.module
    ? p.module
        .split("_")
        .map((part: string) =>
          /^[A-Z]{1,2}\d$/.test(part)
            ? part
            : part.charAt(0) + part.slice(1).toLowerCase(),
        )
        .join(" ")
    : "";
  return `${p.exam_board ?? ""} ${mod} · ${p.paper_year ?? ""}`.trim();
}

function sortQuestions(nums: string[]) {
  return nums.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}

/**
 * Fetch dashboard data.
 * - Called with no args (student view): returns data for the logged-in user.
 * - Called with targetUserId (tutor view): returns data for that student.
 *   Relies on RLS to enforce that the caller (tutor) is actually allowed to
 *   read that student's rows - no extra authorization check is done here.
 */
export async function getDashboardData(
  targetUserId?: string,
): Promise<DashboardData> {
  const supabase = await createClient();

  let userId = targetUserId;
  if (!userId) {
    const { data: claims } = await supabase.auth.getClaims();
    userId = claims?.claims?.sub;
  }

  if (!userId) {
    return {
      name: null,
      email: null,
      exam_board: null,
      topics: [],
      totalQuestions: 0,
      totalAttempted: 0,
    };
  }

  // questions and progress are whole-table reads, so they have to be paged —
  // see lib/fetch-all.ts.
  const [profileRes, topicsRes, papersRes, questions, progress] =
    await Promise.all([
      supabase
        .from("users")
        .select("name, email, exam_board")
        .eq("id", userId)
        .single(),
      supabase.from("topics").select("id, topic, section_course"),
      supabase
        .from("past_paper")
        .select(
          "id, exam_board, spec_level, module, paper_year, qp_path, ms_path",
        ),
      fetchAllRows<{
        id: string;
        topic_id: string | null;
        difficulty: number | null;
        pp_id: string | null;
        question_number: string | null;
      }>("getDashboardData questions", (from, to) =>
        supabase
          .from("questions")
          .select("id, topic_id, difficulty, pp_id, question_number")
          .order("id")
          .range(from, to),
      ),
      fetchAllRows<{ question_id: string; outcome: string | null }>(
        "getDashboardData progress",
        (from, to) =>
          supabase
            .from("student_question_progress")
            .select("question_id, outcome")
            .eq("student_id", userId)
            .order("question_id")
            .range(from, to),
      ),
    ]);

  const profile = profileRes.data;
  const examBoard = profile?.exam_board ?? null;
  const filter = programmeFilter(examBoard);

  const paperById = new Map((papersRes.data ?? []).map((p) => [p.id, p]));

  const validPaperIds = new Set(
    (papersRes.data ?? [])
      .filter((p) => filter(p.exam_board ?? "", p.spec_level ?? ""))
      .map((p) => p.id),
  );

  const validQuestions = questions.filter(
    (q) => q.pp_id && validPaperIds.has(q.pp_id),
  );

  const outcomeFor = new Map(
    progress.map((p) => [
      p.question_id,
      p.outcome as "correct" | "partial" | "incorrect",
    ]),
  );

  const emptyDiff = (): DifficultyStats => ({
    total: 0,
    correct: 0,
    partial: 0,
    incorrect: 0,
    papers: [],
  });

  const topicMap = new Map<string, TopicStats>();
  for (const t of topicsRes.data ?? []) {
    topicMap.set(t.id, {
      id: t.id,
      topic: t.topic ?? "",
      section_course: t.section_course ?? "Other",
      difficulty: { 1: emptyDiff(), 2: emptyDiff(), 3: emptyDiff() },
    });
  }

  type PaperAccum = {
    unattempted: Set<string>;
    completed: Map<string, "correct" | "partial" | "incorrect">;
  };
  const paperAccum = new Map<string, PaperAccum>();

  let totalQuestions = 0;
  let totalAttempted = 0;

  for (const q of validQuestions) {
    if (!q.topic_id || !q.difficulty) continue;
    const t = topicMap.get(q.topic_id);
    if (!t) continue;

    const d = q.difficulty as 1 | 2 | 3;
    t.difficulty[d].total++;
    totalQuestions++;

    const outcome = outcomeFor.get(q.id);
    if (outcome === "correct") {
      t.difficulty[d].correct++;
      totalAttempted++;
    } else if (outcome === "partial") {
      t.difficulty[d].partial++;
      totalAttempted++;
    } else if (outcome === "incorrect") {
      t.difficulty[d].incorrect++;
      totalAttempted++;
    }

    if (q.pp_id) {
      const key = `${q.topic_id}:${d}:${q.pp_id}`;
      if (!paperAccum.has(key)) {
        paperAccum.set(key, { unattempted: new Set(), completed: new Map() });
      }
      const acc = paperAccum.get(key)!;
      const qNum = q.question_number ?? "?";
      if (outcome) {
        acc.completed.set(qNum, outcome);
      } else {
        acc.unattempted.add(qNum);
      }
    }
  }

  for (const [key, acc] of paperAccum.entries()) {
    const parts = key.split(":");
    const topicId = parts[0];
    const diff = Number(parts[1]) as 1 | 2 | 3;
    const paperId = parts[2];

    const t = topicMap.get(topicId);
    if (!t) continue;

    const paper = paperById.get(paperId);
    t.difficulty[diff].papers.push({
      id: paperId,
      label: paper ? paperLabel(paper) : paperId,
      qpPath: paper?.qp_path ?? null,
      msPath: paper?.ms_path ?? null,
      unattempted: sortQuestions([...acc.unattempted]),
      completed: sortQuestions([...acc.completed.keys()]).map((num) => ({
        number: num,
        outcome: acc.completed.get(num)!,
      })),
    });
  }

  for (const t of topicMap.values()) {
    for (const d of [1, 2, 3] as const) {
      t.difficulty[d].papers.sort((a, b) => a.label.localeCompare(b.label));
    }
  }

  const topics = [...topicMap.values()].filter(
    (t) =>
      t.difficulty[1].total + t.difficulty[2].total + t.difficulty[3].total > 0,
  );

  return {
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    exam_board: examBoard,
    topics,
    totalQuestions,
    totalAttempted,
  };
}

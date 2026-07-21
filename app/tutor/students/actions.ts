"use server";

import { createClient } from "@/lib/server";

export type TutorStudent = {
  id: string;
  name: string | null;
  email: string | null;
  exam_board: string | null;
  totalQuestions: number;
  totalAttempted: number;
};

export async function getTutorStudents(): Promise<TutorStudent[]> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const tutorId = claims?.claims?.sub;
  if (!tutorId) return [];

  const { data: links, error: linksError } = await supabase
    .from("student_tutors")
    .select("student_id")
    .eq("tutor_id", tutorId);

  if (linksError || !links || links.length === 0) {
    if (linksError) console.error(linksError);
    return [];
  }

  const studentIds = links.map((l) => l.student_id);

  const { data: students, error: studentsError } = await supabase
    .from("users")
    .select("id, name, email, exam_board")
    .in("id", studentIds)
    .order("name");

  if (studentsError || !students) {
    console.error(studentsError);
    return [];
  }

  const { data: progress, error: progressError } = await supabase
    .from("student_question_progress")
    .select("student_id")
    .in("student_id", studentIds);

  if (progressError) console.error(progressError);

  const { count: totalQuestions } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true });

  const attemptedByStudent = new Map<string, number>();
  for (const p of progress ?? []) {
    attemptedByStudent.set(
      p.student_id,
      (attemptedByStudent.get(p.student_id) ?? 0) + 1,
    );
  }

  return students.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    exam_board: s.exam_board,
    totalQuestions: totalQuestions ?? 0,
    totalAttempted: attemptedByStudent.get(s.id) ?? 0,
  }));
}

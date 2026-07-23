/**
 * Which papers a student is expected to work through, based on their exam
 * board: their own board only, across both specs (new and old).
 *
 * Board names are stored identically on `users.exam_board` and
 * `past_paper.exam_board` (e.g. "OCR A"), so a plain match is enough.
 *
 * Shared by the student dashboard and the tutor views so the two can't drift.
 */
export function programmeFilter(
  examBoard: string | null,
): (board: string, spec: string) => boolean {
  // No board set — show everything rather than silently hiding their whole
  // programme, so the missing setting is obvious.
  if (!examBoard) return () => true;
  return (board) => board === examBoard;
}

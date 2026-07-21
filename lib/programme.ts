/**
 * Which papers a student is expected to work through, based on their exam board.
 * Own board (both specs) + the other main board's new spec for extra practice.
 *
 * Shared by the student dashboard and the tutor view so the two can't drift.
 */
export function programmeFilter(
  examBoard: string | null,
): (board: string, spec: string) => boolean {
  if (examBoard === "AQA") {
    return (board, spec) =>
      board === "AQA" || (board === "EDEXCEL" && spec === "NEW_SPEC");
  }
  if (examBoard === "EDEXCEL") {
    return (board, spec) =>
      board === "EDEXCEL" || (board === "AQA" && spec === "NEW_SPEC");
  }
  if (examBoard === "OCR") {
    return (board, spec) =>
      board === "OCR" || (board === "AQA" && spec === "NEW_SPEC");
  }
  return () => true;
}

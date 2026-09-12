export type Progress = {
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
};

export const EMPTY: Progress = {
  total: 0,
  correct: 0,
  partial: 0,
  incorrect: 0,
};

export const markedCount = (p: Progress) => p.correct + p.partial + p.incorrect;
export const pctComplete = (p: Progress) =>
  p.total > 0 ? Math.round((markedCount(p) / p.total) * 100) : 0;
export const isComplete = (p: Progress) =>
  p.total > 0 && markedCount(p) === p.total;

export const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-assets`;

export function pdfUrl(path: string | null): string | null {
  if (!path) return null;
  // Some sources (worksheets) store an already-absolute URL, while past papers
  // store a path relative to the storage bucket. Only the relative ones need
  // the bucket prefix and per-segment encoding — prefixing an absolute URL
  // would double it up (…/question-assets/https%3A//…).
  if (/^https?:\/\//i.test(path)) return path;
  return `${STORAGE_BASE}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function formatModule(m: string | null) {
  if (!m) return "-";
  return m
    .split("_")
    .map((part) =>
      /^[A-Z]{1,2}\d$/.test(part)
        ? part
        : part.charAt(0) + part.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function uniq(values: (string | null)[]) {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}

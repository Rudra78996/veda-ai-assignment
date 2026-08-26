export function normalizeQuestionLabel(value: string | null | undefined): string {
  if (!value) return "";

  const withoutPrefix = value
    .toLowerCase()
    .trim()
    .replace(
      /^(?:(?:question|answer|ans(?:wer)?|q)\s*(?:no\s*\.?)?\s*[:.#\-–—]?\s*)/i,
      "",
    );

  const parenthesized = withoutPrefix.match(/^(\d+)\s*\(\s*([a-z0-9]+)\s*\)/i);
  if (parenthesized) return `${parenthesized[1]}${parenthesized[2]}`;

  const separated = withoutPrefix.match(
    /^(\d+)\s*[-.]\s*([a-z]|[ivx]+)(?=$|[\s).:,-])/i,
  );
  if (separated) return `${separated[1]}${separated[2]}`;

  const compact = withoutPrefix.match(
    /^(\d+)([a-z]|[ivx]+)?(?=$|[\s).:,-–—])/i,
  );
  if (compact) return `${compact[1]}${compact[2] ?? ""}`;

  return withoutPrefix.replace(/[^a-z0-9]/g, "");
}

export function detectQuestionLabel(
  detectedLabel: string | null | undefined,
  transcription: string,
): string | null {
  if (detectedLabel?.trim()) return detectedLabel.trim();

  const firstLine = transcription.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const match = firstLine.match(
    /^(?:(?:answer|ans(?:wer)?|question|q)\s*(?:no\s*\.?)?\s*[:.#\-–—]?\s*)(\d+(?:\s*[.(\[]?\s*[a-z]\s*[)\]]?)?)/i,
  );

  return match?.[1]?.trim() || null;
}

export function labelsMatch(a: string | null | undefined, b: string | null | undefined) {
  const normalizedA = normalizeQuestionLabel(a);
  const normalizedB = normalizeQuestionLabel(b);
  return normalizedA.length > 0 && normalizedA === normalizedB;
}

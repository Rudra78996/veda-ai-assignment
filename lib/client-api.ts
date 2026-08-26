import type { ApiResult, NormalizedBox, PreparedPage } from "@/lib/types";

export class ClientApiError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "ClientApiError";
    this.retryable = retryable;
  }
}

export async function analyzePage<T>(
  kind: "questions" | "answers",
  page: PreparedPage,
  totalPages: number,
  signal?: AbortSignal,
) {
  const body = new FormData();
  body.set("page", new File([page.blob], `page-${page.pageNumber}.jpg`, { type: page.blob.type }));
  body.set("pageNumber", String(page.pageNumber));
  body.set("totalPages", String(totalPages));

  return request<T>(`/api/analyze/${kind}/page`, {
    method: "POST",
    body,
    signal,
  });
}

export async function postJson<T>(path: string, value: unknown, signal?: AbortSignal) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    signal,
  });
}

export async function locateAnswerRegion(
  page: PreparedPage,
  target: {
    questionLabel: string;
    answerLabel: string | null;
    transcription: string;
  },
  signal?: AbortSignal,
) {
  const body = new FormData();
  body.set("page", new File([page.blob], `page-${page.pageNumber}.jpg`, { type: page.blob.type }));
  body.set("pageNumber", String(page.pageNumber));
  body.set("questionLabel", target.questionLabel);
  body.set("answerLabel", target.answerLabel ?? "");
  body.set("transcription", target.transcription);

  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(45_000)])
    : AbortSignal.timeout(45_000);
  return request<{ found: boolean; box: NormalizedBox | null; confidence: number }>(
    "/api/analyze/answers/locate",
    { method: "POST", body, signal: requestSignal },
  );
}

export async function locateAnswerPage(
  page: PreparedPage,
  targets: Array<{
    targetIndex: number;
    label: string;
    answerLabel: string | null;
    transcriptionPreview: string;
  }>,
  signal?: AbortSignal,
) {
  const body = new FormData();
  body.set("page", new File([page.blob], `page-${page.pageNumber}.jpg`, { type: page.blob.type }));
  body.set("pageNumber", String(page.pageNumber));
  body.set("targets", JSON.stringify(targets));

  return request<{
    locations: Array<{ targetIndex: number; box: NormalizedBox; confidence: number }>;
  }>("/api/analyze/answers/locate-page", { method: "POST", body, signal });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json()) as ApiResult<T>;
  if (!payload.ok) {
    throw new ClientApiError(payload.error.message, payload.error.retryable);
  }
  return payload.data;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

import { NextResponse } from "next/server";

export function success<T>(data: T, requestId = crypto.randomUUID()) {
  return NextResponse.json({ ok: true, data, requestId });
}

export function failure(
  code: string,
  message: string,
  status: number,
  retryable: boolean,
  requestId = crypto.randomUUID(),
) {
  return NextResponse.json(
    { ok: false, error: { code, message, retryable }, requestId },
    { status },
  );
}

export function publicError(
  error: unknown,
  context?: Record<string, string | number | boolean | null | undefined>,
  requestId = crypto.randomUUID(),
) {
  const diagnostic = errorDiagnostic(error);
  console.error(
    `[assessment-analysis-error] ${JSON.stringify({
      requestId,
      ...context,
      ...diagnostic,
    })}`,
  );

  const message = diagnostic.message.toLowerCase();
  if (message.includes("gemini_api_key")) {
    return failure(
      "AI_NOT_CONFIGURED",
      "AI processing is not configured.",
      503,
      false,
      requestId,
    );
  }
  if (
    diagnostic.status === 429 ||
    message.includes("resource_exhausted") ||
    message.includes("rate limit") ||
    message.includes("quota")
  ) {
    return failure(
      "AI_RATE_LIMITED",
      "Gemini is temporarily rate limited. Wait a moment, then retry this assessment.",
      429,
      true,
      requestId,
    );
  }
  if (
    diagnostic.name === "AbortError" ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return failure(
      "AI_TIMEOUT",
      "The AI service took too long to respond.",
      504,
      true,
      requestId,
    );
  }
  if (diagnostic.name === "StructuredOutputError") {
    return failure(
      "AI_RESPONSE_INVALID",
      "Gemini could not return a complete structured result for this page. Please retry it.",
      502,
      true,
      requestId,
    );
  }
  if (diagnostic.status === 401 || diagnostic.status === 403) {
    return failure(
      "AI_AUTHORIZATION_FAILED",
      "The Gemini key is not authorized for the configured model.",
      503,
      false,
      requestId,
    );
  }
  if (diagnostic.status !== null && diagnostic.status >= 500) {
    return failure(
      "AI_UNAVAILABLE",
      "Gemini is temporarily unavailable. Please retry this assessment.",
      503,
      true,
      requestId,
    );
  }
  return failure(
    "AI_PROCESSING_FAILED",
    "The page could not be analyzed. Please retry it.",
    502,
    true,
    requestId,
  );
}

function errorDiagnostic(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: "UnknownError", message: String(error), status: null };
  }

  const status =
    "status" in error && typeof error.status === "number" ? error.status : null;
  const cause = error.cause;
  const validationIssues =
    cause &&
    typeof cause === "object" &&
    "issues" in cause &&
    Array.isArray(cause.issues)
      ? cause.issues.slice(0, 8).map((issue) => {
          if (!issue || typeof issue !== "object") return "unknown";
          const path = "path" in issue && Array.isArray(issue.path) ? issue.path.join(".") : "";
          const code = "code" in issue ? String(issue.code) : "validation";
          return path ? `${path}:${code}` : code;
        })
      : undefined;

  return {
    name: error.name,
    message: error.message,
    status,
    validationIssues,
  };
}

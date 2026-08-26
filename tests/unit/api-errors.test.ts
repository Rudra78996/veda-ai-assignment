import { publicError } from "@/lib/api";
import { StructuredOutputError } from "@/lib/ai/provider";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("analysis API error classification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an explicit retryable rate-limit response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("RESOURCE_EXHAUSTED: quota exceeded"), {
      status: 429,
    });

    const response = publicError(error, { pageNumber: 2 }, "request-rate-limit");
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "AI_RATE_LIMITED", retryable: true },
      requestId: "request-rate-limit",
    });
  });

  it("identifies structured-output validation failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = publicError(
      new StructuredOutputError("Invalid output"),
      { pageNumber: 2 },
      "request-structured",
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("AI_RESPONSE_INVALID");
    expect(body.requestId).toBe("request-structured");
  });
});

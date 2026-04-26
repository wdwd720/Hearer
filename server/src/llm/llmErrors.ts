// Compact LLM error type. We never log the full request/response (it can
// contain user transcripts); we log a short reason and the HTTP status.

export class LlmError extends Error {
  readonly kind: "config" | "network" | "timeout" | "schema" | "provider";
  readonly status?: number;

  constructor(
    kind: "config" | "network" | "timeout" | "schema" | "provider",
    message: string,
    status?: number
  ) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.name = "LlmError";
  }
}

import type { ParaphraseMode, ParaphraseParams } from "./prompts";
import type { DetectionResult } from "@/app/api/detect/route";

// ─── Allowed modes whitelist ──────────────────────────────
const VALID_MODES = new Set<ParaphraseMode>([
  "standard", "fluency", "humanize", "formal",
  "academic", "simple", "creative", "expand", "shorten",
]);

export function isValidMode(mode: unknown): mode is ParaphraseMode {
  return typeof mode === "string" && VALID_MODES.has(mode as ParaphraseMode);
}

// ─── Params validation & clamping ────────────────────────
export function isValidParams(params: unknown): params is ParaphraseParams {
  if (!params || typeof params !== "object" || Array.isArray(params)) return false;
  const p = params as Record<string, unknown>;
  const keys: (keyof ParaphraseParams)[] = ["intensity", "creativity", "naturalness", "complexity"];
  return keys.every((k) => typeof p[k] === "number" && isFinite(p[k] as number));
}

/** Clamp each param to [0, 1] so out-of-range values can't affect prompt behaviour. */
export function clampParams(params: ParaphraseParams): ParaphraseParams {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return {
    intensity:   clamp(params.intensity),
    creativity:  clamp(params.creativity),
    naturalness: clamp(params.naturalness),
    complexity:  clamp(params.complexity),
  };
}

// ─── Text sanitization ────────────────────────────────────
const MAX_TEXT_LENGTH = 50000;
const MIN_WORD_COUNT  = 10;

/**
 * Strips characters that can break prompt delimiters or inject instructions.
 * Removes triple-quote sequences and null bytes.
 */
export function sanitizeText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")       // null bytes
    .replace(/"""/g, "'''" )      // triple-quote → triple-apostrophe (breaks delimiter escape)
    .replace(/\r\n/g, "\n")       // normalize line endings
    .trim();
}

export function validateText(text: unknown): { ok: true; value: string } | { ok: false; error: string; status: number } {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "No text provided.", status: 400 };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `Text too long — max ${MAX_TEXT_LENGTH} characters.`, status: 400 };
  }
  return { ok: true, value: sanitizeText(text) };
}

export function validateWordCount(text: string): boolean {
  return text.trim().split(/\s+/).length >= MIN_WORD_COUNT;
}

// ─── Detection result validation ─────────────────────────
const VALID_VERDICTS = new Set(["AI-Generated", "Likely AI", "Mixed", "Likely Human", "Human-Written"]);
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);

export function isValidDetectionResult(obj: unknown): obj is DetectionResult {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.aiScore === "number"     && isFinite(r.aiScore) &&
    typeof r.humanScore === "number"  && isFinite(r.humanScore) &&
    typeof r.confidence === "string"  && VALID_CONFIDENCE.has(r.confidence) &&
    Array.isArray(r.detectedPatterns) && r.detectedPatterns.every((p) => typeof p === "string") &&
    typeof r.verdict === "string"     && VALID_VERDICTS.has(r.verdict)
  );
}

// ─── Safe error messages ──────────────────────────────────
/**
 * Returns a generic client-safe message regardless of the real error,
 * while leaving the original error available for server-side logging.
 */
export function safeErrorMessage(route: "paraphrase" | "detect"): string {
  return route === "paraphrase"
    ? "Paraphrase failed. Please try again."
    : "Detection failed. Please try again.";
}

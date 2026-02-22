import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildParaphrasePrompt, buildRefinementPrompt, buildDetectionPrompt } from "@/lib/prompts";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  isValidMode,
  isValidParams,
  clampParams,
  validateText,
  safeErrorMessage,
} from "@/lib/validate";
import { isValidDetectionResult } from "@/lib/validate";
import type { ParaphraseMode, ParaphraseParams } from "@/lib/prompts";

// 90-second timeout per chunk
const client = new Anthropic({ timeout: 90_000 });

// Rate limit: 20 paraphrase requests per IP per minute
const RATE_LIMIT      = 20;
const RATE_WINDOW_MS  = 60_000;

// Max chars per chunk — keeps each call within token limits
const CHUNK_SIZE = 3000;

// Max chars to sample when checking AI score on a large output
const SCORE_SAMPLE_CHARS = 3000;

// ── Text chunking ─────────────────────────────────────────
function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const pieces = para.length > CHUNK_SIZE
      ? (para.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) ?? [para])
      : [para];

    for (const piece of pieces) {
      if ((current + "\n\n" + piece).length > CHUNK_SIZE && current) {
        chunks.push(current.trim());
        current = piece;
      } else {
        current = current ? current + "\n\n" + piece : piece;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

// ── Single-chunk paraphrase ───────────────────────────────
async function paraphraseChunk(
  chunk: string,
  mode: ParaphraseMode,
  params: ParaphraseParams,
): Promise<string> {
  const message = await client.messages.create({
    model:      "claude-opus-4-6",
    max_tokens: 4096,
    messages:   [{ role: "user", content: buildParaphrasePrompt(chunk, mode, params) }],
  });
  const result = message.content[0];
  if (result.type !== "text") throw new Error("Unexpected response type");
  return result.text.trim();
}

// ── AI score check (returns 0-100, -1 on failure) ─────────
async function getAiScore(text: string): Promise<{ score: number; patterns: string[] }> {
  try {
    const sample  = text.length > SCORE_SAMPLE_CHARS ? text.slice(0, SCORE_SAMPLE_CHARS) : text;
    const message = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages:   [{ role: "user", content: buildDetectionPrompt(sample) }],
    });
    const raw = message.content[0];
    if (raw.type !== "text") return { score: -1, patterns: [] };
    const match = raw.text.match(/\{[\s\S]*\}/);
    if (!match) return { score: -1, patterns: [] };
    const parsed = JSON.parse(match[0]);
    if (!isValidDetectionResult(parsed)) return { score: -1, patterns: [] };
    return { score: parsed.aiScore, patterns: parsed.detectedPatterns };
  } catch {
    return { score: -1, patterns: [] };
  }
}

// ── Single-chunk refinement ───────────────────────────────
async function refineChunk(
  chunk: string,
  aiScore: number,
  patterns: string[],
): Promise<string> {
  const message = await client.messages.create({
    model:      "claude-opus-4-6",
    max_tokens: 4096,
    messages:   [{ role: "user", content: buildRefinementPrompt(chunk, aiScore, patterns) }],
  });
  const result = message.content[0];
  if (result.type !== "text") return chunk;
  return result.text.trim();
}

// ── Main POST handler ─────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Rate limiting
  const ip = getClientIp(req.headers);
  const rl = checkRateLimit(`paraphrase:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: {
          "Retry-After":           String(Math.ceil(rl.resetInMs / 1000)),
          "X-RateLimit-Limit":     String(RATE_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // 2. Parse body
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { text: rawText, mode, params } = body as Record<string, unknown>;

  // 3. Validate text
  const textResult = validateText(rawText);
  if (!textResult.ok) {
    return NextResponse.json({ error: textResult.error }, { status: textResult.status });
  }
  const text = textResult.value;

  // 4. Validate mode
  if (!isValidMode(mode)) {
    return NextResponse.json(
      { error: "Invalid mode." },
      { status: 400 },
    );
  }

  // 5. Validate & clamp params
  if (!isValidParams(params)) {
    return NextResponse.json(
      { error: "Invalid params. Each field must be a finite number." },
      { status: 400 },
    );
  }
  const safeParams = clampParams(params);

  // 6. Paraphrase + quality loop
  try {
    const chunks = chunkText(text);

    // ── Pass 1: initial paraphrase ──
    const pass1 = await Promise.all(
      chunks.map((c) => paraphraseChunk(c, mode, safeParams))
    );
    let result = pass1.join("\n\n");

    // ── AI score check ──
    const { score, patterns } = await getAiScore(result);

    // ── Pass 2: refinement if still >50% AI ──
    if (score > 50) {
      const refineChunks = chunkText(result);
      const pass2 = await Promise.all(
        refineChunks.map((c) => refineChunk(c, score, patterns))
      );
      result = pass2.join("\n\n");
    }

    return NextResponse.json(
      { result, aiScore: score > 50 ? null : score },
      {
        headers: {
          "X-RateLimit-Limit":     String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(rl.remaining - 1),
        },
      },
    );
  } catch (err) {
    console.error("[paraphrase] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: safeErrorMessage("paraphrase") }, { status: 500 });
  }
}

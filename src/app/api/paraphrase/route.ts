import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildParaphrasePrompt } from "@/lib/prompts";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  isValidMode,
  isValidParams,
  clampParams,
  validateText,
  safeErrorMessage,
} from "@/lib/validate";

// 30-second hard timeout on every Anthropic call
const client = new Anthropic({ timeout: 30_000 });

// Rate limit: 20 paraphrase requests per IP per minute
const RATE_LIMIT      = 20;
const RATE_WINDOW_MS  = 60_000;

export async function POST(req: NextRequest) {
  // ── 1. Rate limiting ──────────────────────────────────
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

  // ── 2. Parse request body ─────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { text: rawText, mode, params } = body as Record<string, unknown>;

  // ── 3. Validate & sanitize text ───────────────────────
  const textResult = validateText(rawText);
  if (!textResult.ok) {
    return NextResponse.json({ error: textResult.error }, { status: textResult.status });
  }
  const text = textResult.value;

  // ── 4. Validate mode enum ─────────────────────────────
  if (!isValidMode(mode)) {
    return NextResponse.json(
      { error: "Invalid mode. Must be one of: standard, fluency, humanize, formal, academic, simple, creative, expand, shorten." },
      { status: 400 },
    );
  }

  // ── 5. Validate & clamp params ────────────────────────
  if (!isValidParams(params)) {
    return NextResponse.json(
      { error: "Invalid params. Each field must be a finite number." },
      { status: 400 },
    );
  }
  const safeParams = clampParams(params);

  // ── 6. Call Anthropic ─────────────────────────────────
  try {
    const prompt = buildParaphrasePrompt(text, mode, safeParams);

    const message = await client.messages.create({
      model:      "claude-opus-4-5",
      max_tokens: 2048,
      messages:   [{ role: "user", content: prompt }],
    });

    const result = message.content[0];
    if (result.type !== "text") throw new Error("Unexpected response type from model");

    return NextResponse.json(
      { result: result.text.trim() },
      {
        headers: {
          "X-RateLimit-Limit":     String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(rl.remaining - 1),
        },
      },
    );
  } catch (err) {
    // Log full error server-side; return generic message to client
    console.error("[paraphrase] Anthropic error:", err);
    return NextResponse.json({ error: safeErrorMessage("paraphrase") }, { status: 500 });
  }
}

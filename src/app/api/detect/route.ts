import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildDetectionPrompt } from "@/lib/prompts";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  validateText,
  validateWordCount,
  isValidDetectionResult,
  safeErrorMessage,
} from "@/lib/validate";

export interface DetectionResult {
  aiScore:           number;
  humanScore:        number;
  confidence:        "low" | "medium" | "high";
  detectedPatterns:  string[];
  verdict:           "AI-Generated" | "Likely AI" | "Mixed" | "Likely Human" | "Human-Written";
}

// 30-second hard timeout on every Anthropic call
const client = new Anthropic({ timeout: 30_000 });

// Rate limit: 30 detect requests per IP per minute
// (higher than paraphrase because auto-detect fires on text changes)
const RATE_LIMIT     = 30;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  // ── 1. Rate limiting ──────────────────────────────────
  const ip = getClientIp(req.headers);
  const rl = checkRateLimit(`detect:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);

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

  const { text: rawText } = body as Record<string, unknown>;

  // ── 3. Validate & sanitize text ───────────────────────
  const textResult = validateText(rawText);
  if (!textResult.ok) {
    return NextResponse.json({ error: textResult.error }, { status: textResult.status });
  }
  const text = textResult.value;

  if (!validateWordCount(text)) {
    return NextResponse.json(
      { error: "Text too short for accurate detection (minimum 10 words)." },
      { status: 400 },
    );
  }

  // ── 4. Call Anthropic ─────────────────────────────────
  try {
    const prompt = buildDetectionPrompt(text);

    const message = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages:   [{ role: "user", content: prompt }],
    });

    const rawResponse = message.content[0];
    if (rawResponse.type !== "text") throw new Error("Unexpected response type from model");

    // ── 5. Parse & validate JSON response ─────────────────
    let parsed: unknown;
    try {
      const jsonMatch = rawResponse.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("[detect] JSON parse error:", parseErr, "| Raw:", rawResponse.text);
      return NextResponse.json({ error: safeErrorMessage("detect") }, { status: 500 });
    }

    if (!isValidDetectionResult(parsed)) {
      console.error("[detect] Invalid result shape:", parsed);
      return NextResponse.json({ error: safeErrorMessage("detect") }, { status: 500 });
    }

    // Clamp numeric scores to valid range
    const result: DetectionResult = {
      ...parsed,
      aiScore:    Math.max(0, Math.min(100, Math.round(parsed.aiScore))),
      humanScore: Math.max(0, Math.min(100, Math.round(parsed.humanScore))),
      // Limit detectedPatterns to strings only, max 5 items
      detectedPatterns: parsed.detectedPatterns
        .filter((p): p is string => typeof p === "string")
        .slice(0, 5),
    };

    return NextResponse.json(result, {
      headers: {
        "X-RateLimit-Limit":     String(RATE_LIMIT),
        "X-RateLimit-Remaining": String(rl.remaining - 1),
      },
    });
  } catch (err) {
    console.error("[detect] Anthropic error:", err);
    return NextResponse.json({ error: safeErrorMessage("detect") }, { status: 500 });
  }
}

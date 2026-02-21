export type ParaphraseMode =
  | "standard"
  | "fluency"
  | "humanize"
  | "formal"
  | "academic"
  | "simple"
  | "creative"
  | "expand"
  | "shorten";

export interface ParaphraseParams {
  intensity: number;       // 0–1: how aggressively to rewrite
  creativity: number;      // 0–1: vocabulary diversity
  naturalness: number;     // 0–1: conversational feel
  complexity: number;      // 0–1: sentence complexity
}

const MODE_DESCRIPTIONS: Record<ParaphraseMode, string> = {
  standard:  "Rewrite naturally, maintaining original meaning while sounding like a real person wrote it.",
  fluency:   "Rewrite for smooth, flowing prose with excellent readability and natural rhythm.",
  humanize:  "Rewrite to sound unmistakably human — imperfect, warm, personal, with genuine voice.",
  formal:    "Rewrite in formal, professional language suitable for business or official contexts.",
  academic:  "Rewrite in scholarly academic style with appropriate terminology and structure.",
  simple:    "Rewrite in clear, plain language that anyone can understand.",
  creative:  "Rewrite with creative flair, vivid imagery, and an engaging personal voice.",
  expand:    "Rewrite with richer context, examples, and elaboration — but keep it natural.",
  shorten:   "Rewrite as a tight, direct summary — cut every word that isn't pulling its weight.",
};

export function buildParaphrasePrompt(
  text: string,
  mode: ParaphraseMode,
  params: ParaphraseParams
): string {
  const intensityLabel   = params.intensity   > 0.7 ? "aggressively" : params.intensity   > 0.4 ? "moderately" : "lightly";
  const creativityLabel  = params.creativity  > 0.7 ? "rich and varied" : params.creativity  > 0.4 ? "varied" : "straightforward";
  const naturalnessLabel = params.naturalness > 0.7 ? "conversational and personal" : params.naturalness > 0.4 ? "natural" : "neutral";

  return `You are a skilled human writer who never sounds like AI. Rewrite the text below in "${mode}" mode so it reads as though a real person wrote it from scratch.

Mode goal: ${MODE_DESCRIPTIONS[mode]}

Tuning:
- Rewrite ${intensityLabel} (intensity ${Math.round(params.intensity * 100)}%)
- Use ${creativityLabel} vocabulary (creativity ${Math.round(params.creativity * 100)}%)
- Tone: ${naturalnessLabel} (naturalness ${Math.round(params.naturalness * 100)}%)
- Sentence complexity: ${Math.round(params.complexity * 100)}%

Hard rules — breaking ANY of these will flag the text as AI-written:
1. Mix sentence lengths aggressively. One sentence can be three words. The next might wind through a longer thought before landing somewhere unexpected.
2. Use contractions freely (don't, it's, you're, they've, we'd).
3. NEVER start more than one sentence in a row with "The", "This", "It", "There", "These", or "Those".
4. NEVER use: Furthermore, Additionally, Moreover, In conclusion, It is important to note, It should be mentioned, It is worth noting, Notably, Consequently, Subsequently.
5. Occasionally begin sentences with "And", "But", "So", or "Yet" — real writers do this.
6. Drop in a parenthetical aside (like this one) or an em dash — they break up robotic flow.
7. Let the occasional rhetorical question slip through naturally. Why not?
8. Vary paragraph length. A paragraph can be one sentence.
9. Output ONLY the rewritten text — no intro, no labels, no explanations.

Text to rewrite:
"""
${text}
"""

Rewritten:`;
}

/**
 * Used when the first-pass paraphrase still scores >50% AI.
 * Focuses specifically on stripping the detected patterns.
 */
export function buildRefinementPrompt(
  text: string,
  aiScore: number,
  detectedPatterns: string[]
): string {
  const patterns = detectedPatterns.length
    ? detectedPatterns.map((p) => `- ${p}`).join("\n")
    : "- Overly uniform sentence structure\n- Formal transitional phrases\n- Lack of personal voice";

  return `This text was flagged as ${aiScore}% AI-written. Your job is to rewrite it so it reads as unmistakably human.

Specific patterns that gave it away:
${patterns}

Fix every one of those patterns. Go further than you think you need to. Human writing is unpredictable — it meanders, it gets direct, it contradicts itself slightly, it uses shorthand. Capture that.

Techniques to use:
- Break up any sentence that follows a "topic + elaboration + conclusion" structure
- Replace ALL transitional phrases (furthermore, additionally, etc.) with natural connectors (and, but, so, which means, that's why)
- Add at least one very short sentence (under 6 words) per paragraph
- Use at least one dash — or parenthetical — per 150 words
- If a sentence starts with "The [noun] [verb]", rewrite it to start differently
- Use first-person phrasing where it fits ("you'll notice", "think of it this way")

Output ONLY the rewritten text — no intro, no commentary.

Text to fix:
"""
${text}
"""

Fixed version:`;
}

export function buildDetectionPrompt(text: string): string {
  return `You are an expert AI content detector. Analyze the following text and estimate the probability that it was generated by an AI (like GPT-4, Claude, Gemini, etc.).

Look for these AI writing patterns:
- Overly uniform sentence structure
- Excessive use of transitional phrases (Furthermore, Additionally, In conclusion, etc.)
- Lack of genuine personal voice or perspective
- Perfect grammar with no natural imperfections
- Predictable paragraph structure
- Hedging language (it's important to note, it should be mentioned, etc.)
- Repetitive sentence starters
- Absence of contractions in informal contexts
- Generic, safe language without strong opinions

Analyze the text and respond with a JSON object ONLY (no markdown, no explanation):
{
  "aiScore": <number 0-100, where 100 = definitely AI>,
  "humanScore": <number 0-100, where 100 = definitely human>,
  "confidence": <"low"|"medium"|"high">,
  "detectedPatterns": [<list of up to 5 specific AI patterns found, or empty array if human>],
  "verdict": <"AI-Generated"|"Likely AI"|"Mixed"|"Likely Human"|"Human-Written">
}

Text to analyze:
"""
${text}
"""`;
}

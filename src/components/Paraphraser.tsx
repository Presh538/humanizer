"use client";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after mount.
 *
 *    0ms   page background fades in
 *  100ms   header logo slides down
 *  200ms   mode tabs slide in from top (staggered 50ms each)
 *  400ms   main card scales up from 0.92 → 1.0
 *  500ms   left/right panels fade in
 * ───────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AiScoreRing } from "./AiScoreRing";
import { ModeDialKit } from "./ModeDialKit";
// import { PdfUpload } from "./PdfUpload"; // TODO: re-enable once file upload is stable
import type { ParaphraseMode, ParaphraseParams } from "@/lib/prompts";
import type { DetectionResult } from "@/app/api/detect/route";

// ─── TIMING ─────────────────────────────────────────────
const TIMING = {
  header:   100,   // header slides in
  tabs:     200,   // mode tabs stagger
  card:     400,   // main card appears
  panels:   500,   // left/right panels
};

// ─── ELEMENT CONFIGS ─────────────────────────────────────
const CARD = {
  initialScale: 0.92,
  spring: { type: "spring" as const, stiffness: 300, damping: 28 },
};

const TABS = {
  stagger:  0.05,   // seconds between each tab
  spring: { type: "spring" as const, stiffness: 400, damping: 25 },
};

const TOOLTIP = {
  spring: { type: "spring" as const, stiffness: 500, damping: 30 },
};

// ─── MODES ───────────────────────────────────────────────
const MODES: { id: ParaphraseMode; label: string; emoji: string; tip: string }[] = [
  { id: "standard",  label: "Standard",  emoji: "✦", tip: "Balanced rewrite that sounds natural" },
  { id: "fluency",   label: "Fluency",   emoji: "◎", tip: "Smooth, flowing prose with great readability" },
  { id: "humanize",  label: "Humanize",  emoji: "♡", tip: "Maximum human authenticity — sounds like a real person" },
  { id: "formal",    label: "Formal",    emoji: "◈", tip: "Professional tone for business and official use" },
  { id: "academic",  label: "Academic",  emoji: "⊕", tip: "Scholarly style with appropriate terminology" },
  { id: "simple",    label: "Simple",    emoji: "◉", tip: "Clear, everyday language anyone can follow" },
  { id: "creative",  label: "Creative",  emoji: "✧", tip: "Vivid, engaging writing with personality" },
  { id: "expand",    label: "Expand",    emoji: "⊞", tip: "Add context and elaboration to grow the content" },
  { id: "shorten",   label: "Shorten",   emoji: "⊟", tip: "Concise summary keeping only what matters" },
];

const DEFAULT_PARAMS: ParaphraseParams = {
  intensity:   0.5,
  creativity:  0.5,
  naturalness: 0.7,
  complexity:  0.5,
};

// ─── Tooltip component ───────────────────────────────────
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            className="absolute top-full left-1/2 mt-2 z-50 pointer-events-none"
            style={{ x: "-50%" }}
            initial={{ opacity: 0, y: -4, scale: 0.92 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{  opacity: 0, y: -4, scale: 0.92 }}
            transition={TOOLTIP.spring}
          >
            {/* Arrow */}
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-1.5 overflow-hidden">
              <div className="w-2 h-2 bg-gray-900 rotate-45 translate-y-1 mx-auto rounded-sm" />
            </div>
            <div className="bg-gray-900 text-white text-[10px] font-medium rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-xl">
              {text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Paraphraser() {
  // ── Stage state (drives all animations)
  const [stage, setStage] = useState(0);

  // ── UI state
  const [inputText, setInputText]     = useState("");
  const [outputText, setOutputText]   = useState("");
  const [activeMode, setActiveMode]   = useState<ParaphraseMode>("humanize");
  const [dialParams, setDialParams]   = useState<ParaphraseParams>(DEFAULT_PARAMS);
  const [isCopied, setIsCopied]       = useState(false);
  // const [pdfMeta, setPdfMeta]         = useState<{ name: string; pages: number } | null>(null); // TODO: file upload

  // ── API state
  const [isParaphrasing, setIsParaphrasing]         = useState(false);
  const [isDetecting, setIsDetecting]               = useState(false);
  const [detection, setDetection]                   = useState<DetectionResult | null>(null);
  const [outputDetection, setOutputDetection]       = useState<DetectionResult | null>(null);
  const [error, setError]                           = useState<string | null>(null);
  const [outputError, setOutputError]               = useState<string | null>(null);

  // ── Refs for stable access inside effects/callbacks
  const detectDebounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rerunDebounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paraphraseAbortRef  = useRef<AbortController | null>(null);
  const hasParaphrasedRef   = useRef(false);   // true after first successful paraphrase
  const inputTextRef        = useRef(inputText);
  const activeModeRef       = useRef(activeMode);
  const dialParamsRef       = useRef(dialParams);

  // Keep refs in sync
  inputTextRef.current   = inputText;
  activeModeRef.current  = activeMode;
  dialParamsRef.current  = dialParams;

  // ── Entrance animation
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStage(1), TIMING.header));
    timers.push(setTimeout(() => setStage(2), TIMING.tabs));
    timers.push(setTimeout(() => setStage(3), TIMING.card));
    timers.push(setTimeout(() => setStage(4), TIMING.panels));
    return () => timers.forEach(clearTimeout);
  }, []);

  // ── Auto-detect AI when input changes (debounced 1.2s)
  useEffect(() => {
    if (detectDebounceRef.current) clearTimeout(detectDebounceRef.current);
    if (!inputText.trim() || inputText.trim().split(/\s+/).length < 10) {
      setDetection(null);
      return;
    }
    detectDebounceRef.current = setTimeout(() => detectAI(inputText), 1200);
    return () => { if (detectDebounceRef.current) clearTimeout(detectDebounceRef.current); };
  }, [inputText]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect AI in output after paraphrase
  useEffect(() => {
    if (!outputText.trim() || outputText.trim().split(/\s+/).length < 10) {
      setOutputDetection(null);
      return;
    }
    detectOutputAI(outputText);
  }, [outputText]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto re-paraphrase when dials or mode change (800ms debounce)
  //    Only fires after the user has already run a paraphrase once.
  const dialKey = `${dialParams.intensity}|${dialParams.creativity}|${dialParams.naturalness}|${dialParams.complexity}|${activeMode}`;

  useEffect(() => {
    if (!hasParaphrasedRef.current) return;
    if (!inputTextRef.current.trim()) return;

    if (rerunDebounceRef.current) clearTimeout(rerunDebounceRef.current);
    rerunDebounceRef.current = setTimeout(() => {
      runParaphrase(inputTextRef.current, activeModeRef.current, dialParamsRef.current);
    }, 800);

    return () => { if (rerunDebounceRef.current) clearTimeout(rerunDebounceRef.current); };
  }, [dialKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core paraphrase function (used by both button and auto-rerun)
  const runParaphrase = useCallback(async (
    text: string,
    mode: ParaphraseMode,
    params: ParaphraseParams,
  ) => {
    if (!text.trim()) return;

    if (paraphraseAbortRef.current) paraphraseAbortRef.current.abort();
    paraphraseAbortRef.current = new AbortController();

    setIsParaphrasing(true);
    setOutputError(null);
    setOutputText("");

    try {
      const res = await fetch("/api/paraphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode, params }),
        signal: paraphraseAbortRef.current.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOutputText(data.result);
      hasParaphrasedRef.current = true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setOutputError(err instanceof Error ? err.message : "Paraphrase failed");
    } finally {
      setIsParaphrasing(false);
    }
  }, []);

  const handleParaphrase = useCallback(() => {
    runParaphrase(inputText, activeMode, dialParams);
  }, [inputText, activeMode, dialParams, runParaphrase]);

  const detectAI = useCallback(async (text: string) => {
    setIsDetecting(true);
    setError(null);
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetection(data as DetectionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const detectOutputAI = useCallback(async (text: string) => {
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok) setOutputDetection(data as DetectionResult);
    } catch { /* silent */ }
  }, []);

  // TODO: re-enable once file upload is stable
  // const handlePdfExtracted = useCallback((text: string, filename: string, pages: number) => {
  //   setInputText(text);
  //   setPdfMeta({ name: filename, pages });
  //   setDetection(null);
  //   setOutputText("");
  //   hasParaphrasedRef.current = false;
  // }, []);

  const copyOutput = useCallback(() => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText);
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [outputText]);

  const wordCount       = inputText.trim()  ? inputText.trim().split(/\s+/).length  : 0;
  const outputWordCount = outputText.trim() ? outputText.trim().split(/\s+/).length : 0;
  const charCount       = inputText.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* ── Invisible DialKit panels */}
      <ModeDialKit mode={activeMode} onChange={setDialParams} />

      {/* ── Header */}
      <motion.header
        className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm"
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: stage >= 1 ? 0 : -60, opacity: stage >= 1 ? 1 : 0 }}
        transition={CARD.spring}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
              <span className="text-white text-sm font-bold">H</span>
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm tracking-tight">Humanizer</span>
              <span className="text-[10px] text-emerald-500 font-medium block leading-none">AI Detector & Rewriter</span>
            </div>
          </div>

          {/* Mode tabs with tooltips */}
          <nav className="hidden md:flex items-center gap-1">
            {MODES.map((mode, i) => (
              <motion.div
                key={mode.id}
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: stage >= 2 ? 0 : -20, opacity: stage >= 2 ? 1 : 0 }}
                transition={{ ...TABS.spring, delay: i * TABS.stagger }}
              >
                <Tooltip text={mode.tip}>
                  <motion.button
                    onClick={() => setActiveMode(mode.id)}
                    className="relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ color: activeMode === mode.id ? "#059669" : "#6b7280" }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {activeMode === mode.id && (
                      <motion.span
                        className="absolute inset-0 rounded-lg bg-emerald-50 border border-emerald-200"
                        layoutId="active-tab"
                        transition={CARD.spring}
                      />
                    )}
                    <span className="relative flex items-center gap-1">
                      <span className="text-[10px]">{mode.emoji}</span>
                      {mode.label}
                    </span>
                  </motion.button>
                </Tooltip>
              </motion.div>
            ))}
          </nav>

          {/* Hint */}
          <div className="flex items-center gap-2">
            {hasParaphrasedRef.current && (
              <motion.span
                className="hidden sm:block text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={TOOLTIP.spring}
              >
                ↻ auto-updating
              </motion.span>
            )}
            <span className="hidden sm:block text-[11px] text-gray-400 bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
              DialKit active
            </span>
          </div>
        </div>

        {/* Mobile mode tabs */}
        <div className="md:hidden px-4 pb-2 flex gap-1 overflow-x-auto">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeMode === mode.id
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "bg-white border-gray-200 text-gray-600"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </motion.header>

      {/* ── Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Mode banner */}
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: stage >= 3 ? 1 : 0, y: stage >= 3 ? 0 : 10 }}
          transition={{ delay: 0.1 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2"
            >
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 uppercase tracking-wider">
                {activeMode} mode
              </span>
              <span className="text-xs text-gray-400">
                {MODES.find((m) => m.id === activeMode)?.tip}
              </span>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* ── Split panels */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          initial={{ scale: CARD.initialScale, opacity: 0 }}
          animate={{ scale: stage >= 3 ? 1 : CARD.initialScale, opacity: stage >= 3 ? 1 : 0 }}
          transition={CARD.spring}
        >
          {/* ── LEFT: Input */}
          <motion.div
            className="relative flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: stage >= 4 ? 0 : -20, opacity: stage >= 4 ? 1 : 0 }}
            transition={{ ...CARD.spring, delay: 0.05 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-300" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Original Text</span>
              </div>
              <div className="flex items-center gap-3">
                {detection && <AiScoreRing score={detection.aiScore} size={56} strokeWidth={5} />}
                {isDetecting && !detection && <AiScoreRing score={0} size={56} strokeWidth={5} isLoading />}
                <span className="text-[10px] text-gray-400">{wordCount} words · {charCount} chars</span>
              </div>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => { setInputText(e.target.value); }}
              placeholder="Paste your text here — or attach a PDF below…"
              className="flex-1 p-4 text-sm text-gray-800 placeholder-gray-300 resize-none outline-none bg-white min-h-[320px] leading-relaxed"
              maxLength={50000}
            />

            <AnimatePresence>
              {detection && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="border-t border-gray-100 px-4 py-3 bg-gray-50/40"
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <VerdictBadge verdict={detection.verdict} />
                    {detection.detectedPatterns.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {detection.detectedPatterns.slice(0, 3).map((p, i) => (
                          <span key={i} className="text-[10px] bg-red-50 text-red-600 border border-red-100 rounded-full px-2 py-0.5">
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-100">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <div className="px-4 py-3 border-t border-gray-100 bg-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => { setInputText(""); setDetection(null); setOutputText(""); hasParaphrasedRef.current = false; }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                >
                  Clear
                </button>

                {/* TODO: re-enable file upload badge + button once file upload is stable */}
                {/* <AnimatePresence>
                  {pdfMeta && (
                    <motion.span ...>📄 {pdfMeta.name} · {pdfMeta.pages}p</motion.span>
                  )}
                </AnimatePresence>
                <PdfUpload onTextExtracted={handlePdfExtracted} disabled={isParaphrasing} /> */}
              </div>
              <motion.button
                onClick={handleParaphrase}
                disabled={!inputText.trim() || isParaphrasing}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #22c55e, #0d9488)" }}
                whileHover={{ scale: 1.03, boxShadow: "0 4px 24px rgba(34, 197, 94, 0.35)" }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                {isParaphrasing ? (
                  <>
                    <motion.span
                      className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white block"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
                    />
                    Rewriting…
                  </>
                ) : (
                  <>
                    <span>✦</span>
                    Humanize
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>

          {/* ── RIGHT: Output */}
          <motion.div
            className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: stage >= 4 ? 0 : 20, opacity: stage >= 4 ? 1 : 0 }}
            transition={{ ...CARD.spring, delay: 0.1 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Humanized Output</span>
              </div>
              <div className="flex items-center gap-3">
                {outputDetection && <AiScoreRing score={outputDetection.aiScore} size={56} strokeWidth={5} />}
                {outputText && <span className="text-[10px] text-gray-400">{outputWordCount} words</span>}
              </div>
            </div>

            <div className="flex-1 relative min-h-[320px]">
              <AnimatePresence mode="wait">
                {isParaphrasing ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8"
                  >
                    <div className="flex gap-1.5">
                      {[0, 1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 rounded-full bg-emerald-400"
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 font-medium">
                      Rewriting in <span className="text-emerald-600 capitalize">{activeMode}</span> mode…
                    </p>
                    {inputText.length > 3000 && (
                      <p className="text-[10px] text-gray-300 text-center">
                        Large document — processing in sections, this may take a moment
                      </p>
                    )}
                  </motion.div>
                ) : outputText ? (
                  <motion.div
                    key="output"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap h-full overflow-y-auto"
                  >
                    {outputText}
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                      <span className="text-xl">✦</span>
                    </div>
                    <p className="text-xs text-gray-400 max-w-[220px]">
                      Paste text on the left and click{" "}
                      <span className="font-semibold text-emerald-600">Humanize</span> to rewrite it in{" "}
                      <span className="capitalize">{activeMode}</span> mode
                    </p>
                    <p className="text-[10px] text-gray-300">
                      Tune parameters via the DialKit panel (top-right)
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {outputDetection && outputText && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="border-t border-gray-100 px-4 py-3 bg-emerald-50/30"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <VerdictBadge verdict={outputDetection.verdict} />
                    <span className="text-[10px] text-gray-500">
                      After humanization — {outputDetection.humanScore}% human
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {outputError && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-100">
                <p className="text-xs text-red-600">{outputError}</p>
              </div>
            )}

            <div className="px-4 py-3 border-t border-gray-100 bg-white flex items-center justify-between">
              <div>
                {detection && outputDetection && (
                  <ScoreComparison before={detection.aiScore} after={outputDetection.aiScore} />
                )}
              </div>
              <div className="flex items-center gap-2">
                {outputText && (
                  <motion.button
                    onClick={copyOutput}
                    className="relative flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 overflow-hidden transition-colors"
                    style={{
                      color:       isCopied ? "#059669" : "#6b7280",
                      borderColor: isCopied ? "#6ee7b7" : "#e5e7eb",
                      background:  isCopied ? "#f0fdf4" : "white",
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    {/* Checkmark / copy icon swap */}
                    <AnimatePresence mode="wait">
                      {isCopied ? (
                        <motion.span
                          key="check"
                          initial={{ scale: 0, rotate: -20 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{   scale: 0, rotate: 20 }}
                          transition={TOOLTIP.spring}
                          className="text-emerald-500"
                        >
                          ✓
                        </motion.span>
                      ) : (
                        <motion.span
                          key="copy"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{   scale: 0 }}
                          transition={TOOLTIP.spring}
                        >
                          ⎘
                        </motion.span>
                      )}
                    </AnimatePresence>

                    <AnimatePresence mode="wait">
                      <motion.span
                        key={isCopied ? "copied" : "copy-label"}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{   opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                      >
                        {isCopied ? "Text Copied!" : "Copy text"}
                      </motion.span>
                    </AnimatePresence>
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* ── Footer cards */}
        <motion.div
          className="mt-6 grid grid-cols-3 gap-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: stage >= 4 ? 1 : 0, y: stage >= 4 ? 0 : 16 }}
          transition={{ delay: 0.3 }}
        >
          {[
            { icon: "🔍", title: "AI Detection",   desc: "Claude analyzes your text for AI writing patterns in real-time" },
            { icon: "✦",  title: "9 Rewrite Modes", desc: "From casual humanization to academic and creative rewrites" },
            { icon: "🎛",  title: "DialKit Controls", desc: "Changes instantly re-run the rewrite — no button needed" },
          ].map((item) => (
            <div key={item.title} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-xs font-semibold text-gray-700 mb-1">{item.title}</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: DetectionResult["verdict"] }) {
  const colors: Record<DetectionResult["verdict"], string> = {
    "AI-Generated":  "bg-red-100 text-red-700 border-red-200",
    "Likely AI":     "bg-orange-100 text-orange-700 border-orange-200",
    "Mixed":         "bg-yellow-100 text-yellow-700 border-yellow-200",
    "Likely Human":  "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Human-Written": "bg-green-100 text-green-700 border-green-200",
  };
  return (
    <span className={`text-[10px] font-bold border rounded-full px-2.5 py-0.5 uppercase tracking-wider ${colors[verdict]}`}>
      {verdict}
    </span>
  );
}

function ScoreComparison({ before, after }: { before: number; after: number }) {
  const diff    = before - after;
  const improved = diff > 0;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-gray-400">AI:</span>
      <span className="font-semibold text-gray-600">{before}%</span>
      <span className={improved ? "text-emerald-500" : "text-gray-400"}>→</span>
      <span className={`font-bold ${improved ? "text-emerald-600" : "text-gray-600"}`}>{after}%</span>
      {improved && <span className="text-emerald-500 font-bold">↓{diff}%</span>}
    </div>
  );
}

"use client";

import { useDialKit } from "dialkit";
import type { ParaphraseMode, ParaphraseParams } from "@/lib/prompts";
import { useEffect, useRef } from "react";

interface ModeDialKitProps {
  mode: ParaphraseMode;
  onChange: (params: ParaphraseParams) => void;
}

/* ─────────────────────────────────────────────────────────
 * DIALKIT PANELS — one per paraphrase mode
 *
 * Fix: useDialKit returns a new object reference every render,
 * so using [params] as a dep causes an infinite loop. Instead:
 * 1. Store onChange in a ref → never a stale-closure dep
 * 2. Derive a primitive key from the four values → React can
 *    do a proper equality check and only fire when sliders move
 * ───────────────────────────────────────────────────────── */

function useSyncParams(
  params: ParaphraseParams,
  onChange: (p: ParaphraseParams) => void,
) {
  // Keep onChange ref fresh without making it a dep
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Primitive key — changes only when slider values actually change
  const key = `${params.intensity}|${params.creativity}|${params.naturalness}|${params.complexity}`;

  useEffect(() => {
    onChangeRef.current(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

function StandardDials({ onChange }: { onChange: (p: ParaphraseParams) => void }) {
  const params = useDialKit("Standard", {
    intensity:   [0.5, 0, 1],
    creativity:  [0.5, 0, 1],
    naturalness: [0.7, 0, 1],
    complexity:  [0.5, 0, 1],
  });
  useSyncParams(params as ParaphraseParams, onChange);
  return null;
}

function FluencyDials({ onChange }: { onChange: (p: ParaphraseParams) => void }) {
  const params = useDialKit("Fluency", {
    intensity:   [0.4, 0, 1],
    creativity:  [0.4, 0, 1],
    naturalness: [0.9, 0, 1],
    complexity:  [0.4, 0, 1],
  });
  useSyncParams(params as ParaphraseParams, onChange);
  return null;
}

function HumanizeDials({ onChange }: { onChange: (p: ParaphraseParams) => void }) {
  const params = useDialKit("Humanize", {
    intensity:   [0.8, 0, 1],
    creativity:  [0.6, 0, 1],
    naturalness: [1.0, 0, 1],
    complexity:  [0.5, 0, 1],
  });
  useSyncParams(params as ParaphraseParams, onChange);
  return null;
}

function FormalDials({ onChange }: { onChange: (p: ParaphraseParams) => void }) {
  const params = useDialKit("Formal", {
    intensity:   [0.6, 0, 1],
    creativity:  [0.2, 0, 1],
    naturalness: [0.3, 0, 1],
    complexity:  [0.8, 0, 1],
  });
  useSyncParams(params as ParaphraseParams, onChange);
  return null;
}

function AcademicDials({ onChange }: { onChange: (p: ParaphraseParams) => void }) {
  const params = useDialKit("Academic", {
    intensity:   [0.7, 0, 1],
    creativity:  [0.3, 0, 1],
    naturalness: [0.3, 0, 1],
    complexity:  [0.9, 0, 1],
  });
  useSyncParams(params as ParaphraseParams, onChange);
  return null;
}

function SimpleDials({ onChange }: { onChange: (p: ParaphraseParams) => void }) {
  const params = useDialKit("Simple", {
    intensity:   [0.7, 0, 1],
    creativity:  [0.3, 0, 1],
    naturalness: [0.9, 0, 1],
    complexity:  [0.1, 0, 1],
  });
  useSyncParams(params as ParaphraseParams, onChange);
  return null;
}

function CreativeDials({ onChange }: { onChange: (p: ParaphraseParams) => void }) {
  const params = useDialKit("Creative", {
    intensity:   [0.8, 0, 1],
    creativity:  [1.0, 0, 1],
    naturalness: [0.7, 0, 1],
    complexity:  [0.6, 0, 1],
  });
  useSyncParams(params as ParaphraseParams, onChange);
  return null;
}

function ExpandDials({ onChange }: { onChange: (p: ParaphraseParams) => void }) {
  const params = useDialKit("Expand", {
    intensity:   [0.6, 0, 1],
    creativity:  [0.5, 0, 1],
    naturalness: [0.7, 0, 1],
    complexity:  [0.6, 0, 1],
  });
  useSyncParams(params as ParaphraseParams, onChange);
  return null;
}

function ShortenDials({ onChange }: { onChange: (p: ParaphraseParams) => void }) {
  const params = useDialKit("Shorten", {
    intensity:   [0.9, 0, 1],
    creativity:  [0.3, 0, 1],
    naturalness: [0.6, 0, 1],
    complexity:  [0.3, 0, 1],
  });
  useSyncParams(params as ParaphraseParams, onChange);
  return null;
}

const DIAL_MAP: Record<ParaphraseMode, React.FC<{ onChange: (p: ParaphraseParams) => void }>> = {
  standard:  StandardDials,
  fluency:   FluencyDials,
  humanize:  HumanizeDials,
  formal:    FormalDials,
  academic:  AcademicDials,
  simple:    SimpleDials,
  creative:  CreativeDials,
  expand:    ExpandDials,
  shorten:   ShortenDials,
};

export function ModeDialKit({ mode, onChange }: ModeDialKitProps) {
  const DialComponent = DIAL_MAP[mode];
  return <DialComponent onChange={onChange} />;
}

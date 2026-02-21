"use client";

import { motion } from "motion/react";

interface AiScoreRingProps {
  score: number;        // 0–100, AI probability
  size?: number;
  strokeWidth?: number;
  isLoading?: boolean;
}

export function AiScoreRing({
  score,
  size = 88,
  strokeWidth = 7,
  isLoading = false,
}: AiScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  // Color based on AI score
  const color =
    score >= 70
      ? "#ef4444"   // red — high AI
      : score >= 40
      ? "#f97316"   // orange — medium
      : "#22c55e";  // green — mostly human

  const label =
    score >= 70 ? "AI" : score >= 40 ? "Mixed" : "Human";

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          {/* Score arc */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: isLoading ? circumference * 0.7 : offset }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isLoading ? (
            <motion.div
              className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-600"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
          ) : (
            <>
              <motion.span
                className="text-xl font-bold leading-none"
                style={{ color }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
              >
                {score}%
              </motion.span>
            </>
          )}
        </div>
      </div>

      <div className="text-center">
        <motion.span
          className="text-xs font-semibold tracking-wide"
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {isLoading ? "Analyzing..." : label}
        </motion.span>
        <p className="text-[10px] text-gray-400 mt-0.5">AI Score</p>
      </div>
    </div>
  );
}

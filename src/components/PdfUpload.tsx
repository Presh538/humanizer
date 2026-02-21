"use client";

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

interface PdfUploadProps {
  onTextExtracted: (text: string, filename: string, pages: number) => void;
  disabled?: boolean;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function PdfUpload({ onTextExtracted, disabled }: PdfUploadProps) {
  const inputRef                    = useRef<HTMLInputElement>(null);
  const [state, setState]           = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const upload = useCallback(async (file: File) => {
    if (!file) return;

    setState("uploading");
    setErrorMsg(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res  = await fetch("/api/parse-pdf", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Upload failed.");
        setState("error");
        return;
      }

      onTextExtracted(data.text, file.name, data.pageCount);
      setState("success");

      // Reset to idle after 3s
      setTimeout(() => setState("idle"), 3000);
    } catch {
      setErrorMsg("Could not reach the server. Please try again.");
      setState("error");
    }
  }, [onTextExtracted]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }, [upload]);

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true);  };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || state === "uploading"}
      />

      {/* Drop-zone overlay — only visible while dragging */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl pointer-events-none"
            style={{ background: "rgba(16,185,129,0.08)", border: "2px dashed #10b981" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <span className="text-3xl mb-2">📄</span>
            <p className="text-sm font-semibold text-emerald-600">Drop file here</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error toast */}
      <AnimatePresence>
        {state === "error" && errorMsg && (
          <motion.div
            className="absolute bottom-14 left-4 right-4 z-30 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 shadow-md"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <p className="text-xs text-red-600 font-medium">{errorMsg}</p>
            <button
              onClick={() => setState("idle")}
              className="text-red-400 hover:text-red-600 text-sm leading-none"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The upload button itself */}
      <motion.button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || state === "uploading"}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          color:       state === "success" ? "#059669" : "#6b7280",
          borderColor: state === "success" ? "#6ee7b7" : isDragging ? "#10b981" : "#e5e7eb",
          background:  state === "success" ? "#f0fdf4" : isDragging ? "rgba(16,185,129,0.04)" : "white",
        }}
        whileHover={{ scale: disabled ? 1 : 1.02 }}
        whileTap={{ scale: disabled ? 1 : 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <AnimatePresence mode="wait">
          {state === "uploading" ? (
            <motion.span
              key="spinner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5"
            >
              <motion.span
                className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 block"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
              />
              Parsing…
            </motion.span>
          ) : state === "success" ? (
            <motion.span
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-emerald-600"
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
            >
              ✓ File loaded
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5"
            >
              <span className="text-[11px]">📎</span>
              Attach file
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}

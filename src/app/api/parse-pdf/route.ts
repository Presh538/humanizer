import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { sanitizeText } from "@/lib/validate";

// Rate limit: 10 uploads per IP per minute
const RATE_LIMIT     = 10;
const RATE_WINDOW_MS = 60_000;

// 5 MB max file size
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Supported MIME types
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME  = "application/msword";
const PDF_MIME  = "application/pdf";

// PDF magic bytes: %PDF
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);
// DOCX/DOC magic bytes (ZIP PK header for .docx; D0CF for old .doc)
const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOC_MAGIC  = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

export async function POST(req: NextRequest) {
  // ── 1. Rate limiting ──────────────────────────────────
  const ip = getClientIp(req.headers);
  const rl = checkRateLimit(`parse-pdf:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetInMs / 1000)) },
      },
    );
  }

  // ── 2. Parse multipart form ───────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file attached." }, { status: 400 });
  }

  // ── 3. Detect file type ───────────────────────────────
  const mime     = file.type;
  const isPdf    = mime === PDF_MIME;
  const isDocx   = mime === DOCX_MIME;
  const isDoc    = mime === DOC_MIME;
  // Browsers sometimes send application/octet-stream — fall back to magic bytes
  const unknown  = !isPdf && !isDocx && !isDoc;

  if (!isPdf && !isDocx && !isDoc && mime !== "application/octet-stream") {
    return NextResponse.json(
      { error: "Only PDF, .docx, and .doc files are supported." },
      { status: 400 },
    );
  }

  // ── 4. Validate file size ─────────────────────────────
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_BYTES / 1024 / 1024} MB.` },
      { status: 400 },
    );
  }

  // ── 5. Read bytes & resolve type from magic bytes ─────
  const arrayBuffer = await file.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);
  const magic4      = buffer.subarray(0, 4);

  const actuallyPdf  = magic4.equals(PDF_MAGIC);
  const actuallyDocx = magic4.equals(DOCX_MAGIC);
  const actuallyDoc  = magic4.equals(DOC_MAGIC);

  if (!actuallyPdf && !actuallyDocx && !actuallyDoc) {
    return NextResponse.json(
      { error: "File does not appear to be a valid PDF or Word document." },
      { status: 400 },
    );
  }

  // ── 6. Extract text ───────────────────────────────────
  try {
    let rawText   = "";
    let pageCount = 1;

    if (actuallyDocx || (unknown && actuallyDocx)) {
      // .docx — extract plain text via mammoth
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;

    } else if (actuallyDoc) {
      // Old .doc binary format — mammoth has limited support
      try {
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
      } catch {
        return NextResponse.json(
          { error: "Old .doc format could not be read. Please save as .docx and try again." },
          { status: 422 },
        );
      }

    } else {
      // PDF — use pdfjs-dist directly (avoids bundling issues with pdf-parse)
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "";

      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 });
      const doc         = await loadingTask.promise;
      pageCount         = doc.numPages;

      const pageTexts: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page    = await doc.getPage(i);
        const content = await page.getTextContent();
        const text    = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        pageTexts.push(text);
        page.cleanup();
      }
      await doc.destroy();
      rawText = pageTexts.join("\n\n");
    }

    if (!rawText?.trim()) {
      return NextResponse.json(
        { error: "No readable text found. The file may be image-based or empty." },
        { status: 422 },
      );
    }

    const cleaned = rawText
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/-\n(\w)/g, "$1")
      .trim();

    const text = sanitizeText(cleaned);

    return NextResponse.json({
      text,
      pageCount,
      wordCount: text.trim().split(/\s+/).length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[parse-file] Error:", msg, err);
    return NextResponse.json(
      { error: "Could not read the file. It may be encrypted or corrupted." },
      { status: 500 },
    );
  }
}

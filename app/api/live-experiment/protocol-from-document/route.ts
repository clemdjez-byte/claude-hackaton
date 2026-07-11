// Crée un protocole (brouillon) à partir d'un ou plusieurs documents déposés :
// texte/markdown en direct, .docx via mammoth, PDF/image via une transcription
// Claude (pas d'OCR dédié en standalone — cf. constraints.md, zéro Mistral).
// Le texte extrait alimente ensuite la brique `generateProtocolFromDocument`.
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import mammoth from "mammoth";
import { generateProtocolFromDocument } from "@/lib/live-experiment";
import { getBenchSession, WS } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300; // transcription Claude + génération peuvent être longues.

const MAX_BYTES = 20 * 1024 * 1024; // 20 Mo, comme l'import Sylvy.
const TEXT_CAP = 16000; // borne d'entrée LLM.

// ── Détection de type : par EXTENSION d'abord (le MIME envoyé par le
// navigateur est souvent vide ou faux, notamment pour .md/.webp), le MIME
// sert de secours. Même logique que /api/live-experiment/evidence-data. ──
function extOf(name: string): string {
  const m = /\.([^.]+)$/.exec(name.toLowerCase());
  return m ? m[1] : "";
}

// Recopié de SYLVY lib/markdown.ts (fonction pure, 3 lignes) : un .md est déjà
// du texte, pas besoin d'extraction.
function isMarkdownFile(mimeType: string, fileName: string): boolean {
  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") return true;
  return /\.(md|markdown)$/i.test(fileName);
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// docx → texte : mammoth rend du HTML, on retire les balises pour un brief propre.
// Recopié de la route SYLVY équivalente.
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const IMAGE_MEDIA_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const IMAGE_MIME = new Set(Object.values(IMAGE_MEDIA_TYPE));

const TRANSCRIBE_PROMPT =
  "Transcris fidèlement le texte de ce document, en markdown, sans commentaire ni ajout.";

// PDF/image → un appel Claude qui transcrit le document en texte. Vit ici
// (route hôte), pas dans la brique — la brique ne parle qu'à du texte.
async function transcribeWithClaude(
  buffer: Buffer,
  mediaType: string,
  kind: "file" | "image"
): Promise<string> {
  const { text } = await generateText({
    model: anthropic("claude-sonnet-5"),
    prompt: [
      {
        role: "user",
        content: [
          { type: "text", text: TRANSCRIBE_PROMPT },
          kind === "file"
            ? { type: "file", data: buffer, mediaType }
            : { type: "image", image: buffer, mediaType },
        ],
      },
    ],
  });
  return text;
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const context = (form.get("context") ?? "").toString().slice(0, 4000);
  if (files.length === 0) {
    return Response.json({ error: "At least one file is required." }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return Response.json(
        { error: `"${f.name}" is too large (max 20 MB).` },
        { status: 413 }
      );
    }
  }

  const { store } = getBenchSession();

  // Extraction du texte de chaque fichier, puis concaténation étiquetée par
  // nom de fichier (même schéma que l'import Sylvy).
  const parts: string[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extOf(file.name);
    const mime = file.type;
    let text = "";
    try {
      if (isMarkdownFile(mime, file.name) || mime.startsWith("text/") || ext === "txt") {
        text = buffer.toString("utf-8");
      } else if (ext === "docx" || mime === DOCX_MIME) {
        const result = await mammoth.convertToHtml({ buffer });
        text = htmlToText(result.value.trim());
      } else if (ext === "pdf" || mime === "application/pdf") {
        text = await transcribeWithClaude(buffer, "application/pdf", "file");
      } else if (IMAGE_MEDIA_TYPE[ext] || IMAGE_MIME.has(mime)) {
        const mediaType = IMAGE_MEDIA_TYPE[ext] ?? mime;
        text = await transcribeWithClaude(buffer, mediaType, "image");
      } else {
        return Response.json(
          { error: `Unsupported file type: ${mime || file.name}` },
          { status: 415 }
        );
      }
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Text extraction failed." },
        { status: 500 }
      );
    }
    text = text.trim();
    if (text) parts.push(`## ${file.name}\n${text}`);
  }

  let combined = parts.join("\n\n---\n\n").trim();
  if (!combined) {
    return Response.json({ error: "No text found in the documents." }, { status: 422 });
  }
  if (combined.length > TEXT_CAP) combined = combined.slice(0, TEXT_CAP);

  try {
    const protocol = await generateProtocolFromDocument(store, WS, combined, context);
    return Response.json({ protocolId: protocol.id });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Protocol generation failed." },
      { status: 500 }
    );
  }
}

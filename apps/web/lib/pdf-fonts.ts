import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The fonts a PDF is drawn with (Noto Sans and Noto Sans Arabic, SIL Open
// Font License, public/fonts/OFL.txt). They live in public/fonts, so the
// build and the server read them from disk; next.config.mjs adds them to the
// server function. Should the disk not have them, they are fetched from the
// site itself, where the same files are served.

const FILES = { latin: "NotoSans-Regular.ttf", arabic: "NotoSansArabic-Regular.ttf", arabicBold: "NotoSansArabic-Bold.ttf" } as const;
export type PdfFonts = { latin: Uint8Array; arabic: Uint8Array; arabicBold: Uint8Array };

let cached: Promise<PdfFonts> | null = null;

async function one(name: string, origin?: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(join(process.cwd(), "public", "fonts", name)));
  } catch (error) {
    if (!origin) throw error;
    const response = await fetch(`${origin}/fonts/${name}`);
    if (!response.ok) throw new Error(`Font ${name} could not be loaded.`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

export function pdfFonts(origin?: string): Promise<PdfFonts> {
  cached ??= Promise.all([one(FILES.latin, origin), one(FILES.arabic, origin), one(FILES.arabicBold, origin)])
    .then(([latin, arabic, arabicBold]) => ({ latin, arabic, arabicBold }))
    .catch((error) => { cached = null; throw error; });
  return cached;
}

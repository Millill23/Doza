import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { getUploadsDir, uploadMime } from "@doza/shared/uploads";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } },
) {
  // защита от path traversal
  const rel = normalize(params.path.join("/")).replace(/^(\.\.[/\\])+/, "");
  if (rel.includes("..")) return new Response("Not found", { status: 404 });

  try {
    const data = await readFile(join(getUploadsDir(), rel));
    return new Response(data, {
      headers: {
        "Content-Type": uploadMime(rel),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

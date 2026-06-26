import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { getUploadsDir, uploadMime } from "@doza/shared/uploads";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const raw = params.path ?? "";
  const rel = normalize(raw).replace(/^(\.\.[/\\])+/, "");
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
};

import { readFile } from "node:fs/promises";
import path from "node:path";

let cache: ArrayBuffer | null = null;

export async function getPlayfairDisplayWoff(): Promise<ArrayBuffer> {
  if (cache) return cache;
  const fontPath = path.join(
    process.cwd(),
    "node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff",
  );
  const buffer = await readFile(fontPath);
  cache = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return cache;
}

import sharp from "sharp";
import type { AnthropicImageMediaType } from "@/lib/prompts/types";

const MAX_DIMENSION = 2048;

/** Typical phone-camera PNGs are far larger than a PDF export; downsizing cuts Vision payload size. */
const LARGE_BYTES_THRESHOLD = 400 * 1024;

/**
 * Compress / resize oversized images before the Anthropic Messages API.
 * Leaves small thumbnails and already-compact uploads unchanged when possible.
 */
export async function normalizeImageForAnthropicVision(
  input: Buffer,
  originalMedia: AnthropicImageMediaType,
): Promise<{ base64: string; mediaType: AnthropicImageMediaType }> {
  try {
    const meta = await sharp(input).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const pixelHeavy = w > MAX_DIMENSION || h > MAX_DIMENSION;
    const byteHeavy = input.length >= LARGE_BYTES_THRESHOLD;
    if (!pixelHeavy && !byteHeavy) {
      return {
        base64: input.toString("base64"),
        mediaType: originalMedia,
      };
    }
    const out = await sharp(input)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return {
      base64: out.toString("base64"),
      mediaType: "image/jpeg",
    };
  } catch {
    return {
      base64: input.toString("base64"),
      mediaType: originalMedia,
    };
  }
}

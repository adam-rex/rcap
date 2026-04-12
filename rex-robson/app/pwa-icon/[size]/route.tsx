import { ImageResponse } from "next/og";
import { getPlayfairDisplayWoff } from "@/lib/playfair-icon-font";

export const runtime = "nodejs";

const ALLOWED = new Set([192, 512]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> },
) {
  const { size: raw } = await context.params;
  const dim = Number.parseInt(raw, 10);
  if (!ALLOWED.has(dim)) {
    return new Response("Not Found", { status: 404 });
  }

  const fontData = await getPlayfairDisplayWoff();
  const fontSize = Math.round(dim * 0.62);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
          color: "#F5F5F0",
          fontSize,
          fontFamily: "Playfair Display",
        }}
      >
        R
      </div>
    ),
    {
      width: dim,
      height: dim,
      fonts: [
        {
          name: "Playfair Display",
          data: fontData,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}

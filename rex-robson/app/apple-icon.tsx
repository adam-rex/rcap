import { ImageResponse } from "next/og";
import { getPlayfairDisplayWoff } from "@/lib/playfair-icon-font";

export const runtime = "nodejs";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default async function AppleIcon() {
  const fontData = await getPlayfairDisplayWoff();

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
          fontSize: 118,
          fontFamily: "Playfair Display",
        }}
      >
        R
      </div>
    ),
    {
      ...size,
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

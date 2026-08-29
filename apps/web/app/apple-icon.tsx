import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen mark: same strike-slip geometry as `icon.svg`, scaled for the iOS squircle mask. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          backgroundColor: "#f5f0e8",
          border: "12px solid #1a1612",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 23,
            top: 56,
            width: 56,
            height: 22,
            backgroundColor: "#1a1612",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 79,
            top: 56,
            width: 22,
            height: 68,
            backgroundColor: "#c0392b",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 101,
            top: 102,
            width: 56,
            height: 22,
            backgroundColor: "#1a1612",
          }}
        />
      </div>
    ),
    size,
  );
}

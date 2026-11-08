// Shared by app/icon.tsx and app/apple-icon.tsx (rendered through next/og, so inline styles only).
// The glyph stays inside the central 60% so the same image works as a maskable icon.
export const BRAND_COLOR = "#721216";

export function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_COLOR,
        color: "#ffffff",
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      <div style={{ fontSize: size * 0.2, letterSpacing: size * 0.01 }}>
        RSSB
      </div>
      <div
        style={{
          fontSize: size * 0.11,
          marginTop: size * 0.04,
          letterSpacing: size * 0.012,
          opacity: 0.85,
        }}
      >
        STOCK
      </div>
    </div>
  );
}

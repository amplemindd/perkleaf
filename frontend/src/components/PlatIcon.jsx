import React from "react";

// Round text-logo badges for the delivery platforms (SVG, no image files needed)
const CFG = {
  swiggy: { a: "#FF9A3C", b: "#F26A00", t: "S", w: "SWIGGY" },
  zomato: { a: "#F2566A", b: "#C81E2D", t: "Z", w: "ZOMATO" },
};
export default function PlatIcon({ p, size = 40, word = true }) {
  const c = CFG[p] || CFG.swiggy, id = `pi-${p}-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={c.w}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c.a} /><stop offset="1" stopColor={c.b} /></linearGradient></defs>
      <circle cx="24" cy="24" r="23" fill={`url(#${id})`} stroke="#fff" strokeOpacity=".9" strokeWidth="1.5" />
      <text x="24" y={word ? 28 : 33} textAnchor="middle" fontFamily="Poppins, 'Arial Black', Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize={word ? 24 : 28} fill="#fff">{c.t}</text>
      {word && <text x="24" y="39" textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight="800" fontSize="6.4" letterSpacing=".6" fill="#fff" opacity=".95">{c.w}</text>}
    </svg>
  );
}

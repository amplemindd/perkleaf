/* Font choices for Settings -> Primary Font.
   All of these are loaded from Google Fonts (see public/index.html).
   "dev" = has Devanagari (Hindi / Marathi) glyphs natively. */
export const FONTS = [
  { value: "Poppins", label: "Poppins", dev: true },
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Nunito", label: "Nunito" },
  { value: "Lato", label: "Lato" },
  { value: "Mukta", label: "Mukta (Hindi / Marathi)", dev: true },
  { value: "Hind", label: "Hind (Hindi / Marathi)", dev: true },
  { value: "Noto Sans", label: "Noto Sans (Hindi / Marathi)", dev: true },
  { value: "Baloo 2", label: "Baloo 2 (Hindi / Marathi)", dev: true },
  { value: "Tiro Devanagari Hindi", label: "Tiro Devanagari (Serif)", dev: true },
];
const FALLBACK = '"Noto Sans Devanagari", "Mukta", "Hind", system-ui, -apple-system, "Segoe UI", sans-serif';
export const fontStack = (name) => `"${name || "Poppins"}", ${FALLBACK}`;
export const fontKey = "bb_font";

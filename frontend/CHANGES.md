# Kya badla gaya hai

1. **Single global CSS** – `src/styles/global.css` (sab 23 css files merge ho gayi; purani files delete).
   Sirf `src/index.js` me import hota hai. Page/component files me ab koi css import nahi.
2. **Dark mode har jagah** – sab colours ab theme variables (tokens) se aate hain.
   Light/Dark ke colours `global.css` ke top me (`:root` aur `:root[data-theme="dark"]`) badlo.
3. **Fonts** – Settings > Theme & Appearance > Primary Font me 12 fonts + live preview
   (Hindi/Marathi ke liye Mukta, Hind, Noto Sans, Baloo 2, Tiro Devanagari). Fonts `public/index.html` me load hote hain.
4. **Hindi / Marathi** – Settings > Language. Poora UI auto translate hota hai.
   Translations: `src/i18n/translations.js` (nayi line add karo: `"English": ["हिंदी","मराठी"]`).
5. Dark mode / font / language save karne se pehle live preview me dikhte hain, aur login page par bhi yaad rehte hain.

Backend note: agar backend `font` / `language` values ko whitelist karta hai to naye font names
(Montserrat, Nunito, Lato, Mukta, Hind, Noto Sans, Baloo 2, Tiro Devanagari Hindi) allow karo.

Run: `npm install` then `npm start`.

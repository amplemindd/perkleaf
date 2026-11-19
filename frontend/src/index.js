import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import './styles/responsive.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

/* =====================================================================
   TABLET = DESKTOP VIEW  (sirf /admin pages par)
   Tab par page ko 1366px (landscape) / 1024px (portrait) wide desktop
   layout ki tarah dikhata hai, aur screen me fit kar deta hai.
   Font chhota / bada karna ho to neeche ke 2 numbers badlo:
   bada number = chhota font, chhota number = bada font.
   ===================================================================== */
const LANDSCAPE_W = 1366;
const PORTRAIT_W = 1024;

function applyTabletView() {
  try {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const isTablet =
      window.matchMedia('(pointer: coarse)').matches &&
      Math.min(window.screen.width, window.screen.height) >= 600; // phone nahi
    const isAdmin = window.location.pathname.startsWith('/admin');
    const portrait = window.matchMedia('(orientation: portrait)').matches;

    const next =
      isTablet && isAdmin
        ? `width=${portrait ? PORTRAIT_W : LANDSCAPE_W}`
        : 'width=device-width, initial-scale=1';

    if (meta.getAttribute('content') !== next) meta.setAttribute('content', next);
  } catch (e) {
    /* ignore */
  }
}
applyTabletView();
['bbnav', 'popstate', 'orientationchange', 'resize'].forEach((ev) =>
  window.addEventListener(ev, applyTabletView)
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();
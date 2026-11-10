// Kleine Helfer fuer den innerHTML-Neuaufbau der Views.

/** Maskiert Text, der in HTML eingesetzt wird. */
export function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Kurzform fuer container.querySelector */
export function q(wurzel, wahl) {
  return wurzel.querySelector(wahl);
}

/** Bindet einen Klick-Handler an alle passenden Elemente. */
export function aufKlick(wurzel, wahl, fn) {
  wurzel.querySelectorAll(wahl).forEach((el) => el.addEventListener('click', (e) => fn(el, e)));
}

/** Geraet wird nur mit dem Finger bedient (Handy, Tablet) - keine Maus, kein Strg+V. */
export function nurFinger() {
  return Boolean(window.matchMedia && window.matchMedia('(hover: none)').matches);
}

/** Farbe des Fehlerbalkens: viel gruen = sitzt, viel rot = viele Fehler. */
export function quoteFarbe(quote) {
  if (quote === null) return 'var(--rand)';
  if (quote >= 0.9) return 'var(--gruen)';
  if (quote >= 0.7) return 'var(--honig-dunkel)';
  return 'var(--rot)';
}

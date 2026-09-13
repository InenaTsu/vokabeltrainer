// Bootstrap: Daten laden, Kopfzeile bauen, Ansichten umschalten.

import { state, subscribe, laden, zeige, meldungWeg, melden } from './state.js';
import { biene } from './bee.js';
import { esc } from './dom.js';
import * as uebersicht from './views/uebersicht.js';
import * as abfrage from './views/abfrage.js';
import * as verwalten from './views/verwalten.js';
import * as einstellungen from './views/einstellungen.js';

const ANSICHTEN = {
  uebersicht,
  abfrage,
  verwalten,
  einstellungen
};

const NAV = [
  { ansicht: 'uebersicht', text: 'Üben' },
  { ansicht: 'verwalten', text: 'Vokabeln' },
  { ansicht: 'einstellungen', text: 'Einstellungen' }
];

const app = document.getElementById('app');
const navBereich = document.getElementById('nav');
const meldungBereich = document.getElementById('meldung');

document.getElementById('kopf-biene').innerHTML = biene('neutral');
document.getElementById('zur-uebersicht').addEventListener('click', () => zeige('uebersicht'));

function navZeichnen() {
  navBereich.innerHTML = NAV.map(
    (n) =>
      `<button type="button" data-ansicht="${n.ansicht}" class="${
        state.ansicht === n.ansicht ? 'aktiv' : ''
      }">${n.text}</button>`
  ).join('');
  navBereich.querySelectorAll('[data-ansicht]').forEach((el) =>
    el.addEventListener('click', () => {
      if (el.dataset.ansicht === 'verwalten') state.verwaltenBereich = null;
      zeige(el.dataset.ansicht);
    })
  );
}

function meldungZeichnen() {
  if (!state.meldung) {
    meldungBereich.innerHTML = '';
    return;
  }
  meldungBereich.innerHTML = `
    <div class="meldung ${state.meldung.art}">
      <span>${esc(state.meldung.text)}</span>
      <button type="button" data-weg>Ok</button>
    </div>`;
  meldungBereich.querySelector('[data-weg]').addEventListener('click', meldungWeg);
}

function zeichnen() {
  navZeichnen();
  meldungZeichnen();
  const ansicht = ANSICHTEN[state.ansicht] || uebersicht;
  ansicht.render(app);
}

subscribe(zeichnen);

laden()
  .then(zeichnen)
  .catch((fehler) => {
    zeichnen();
    melden('fehler', 'Die gespeicherten Vokabeln konnten nicht geladen werden: ' + (fehler?.message || fehler));
  });

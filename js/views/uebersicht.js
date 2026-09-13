// Startseite: alle Bereiche mit Biene und Fehlerbalken, Auswahl fuers Ueben,
// dazu die Liste der schwersten Woerter.

import {
  state,
  notify,
  zeige,
  bereichStatistik,
  schwersteWoerter,
  bereichName,
  bereichVerschieben
} from '../state.js';
import { biene, sterneMarkup } from '../bee.js';
import { esc, aufKlick, quoteFarbe } from '../dom.js';
import { starteAbfrage } from './abfrage.js';

export function render(wurzel) {
  if (state.bereiche.length === 0) {
    wurzel.innerHTML = leerAnsicht();
    aufKlick(wurzel, '[data-neu]', () => zeige('verwalten'));
    return;
  }

  const auswahl = new Set(state.auswahl);
  const schwere = schwersteWoerter(10);

  wurzel.innerHTML = `
    <h1>Deine Bereiche</h1>
    <p class="unterzeile">Wähle einen Bereich, mehrere oder alle - dann kann es losgehen.</p>

    <div class="karte">
      <div class="reihe reihe-auswahl">
        <button type="button" data-alle>Alle auswählen</button>
        <button type="button" data-keine class="leise">Auswahl leeren</button>
        <span class="reihe-ende marke-chip">${auswahl.size} ausgewählt</span>
      </div>

      <div class="reihe abstand">
        <label for="richtung" style="margin:0">Abfragen:</label>
        <select id="richtung" style="width:auto; min-width:230px">
          <option value="de-en">Deutsch &rarr; Englisch</option>
          <option value="en-de">Englisch &rarr; Deutsch</option>
          <option value="mix">Gemischt</option>
        </select>
        <button type="button" class="haupt gross reihe-ende" data-start ${auswahl.size === 0 ? 'disabled' : ''}>
          Üben starten
        </button>
      </div>
    </div>

    <h2>Bereiche</h2>
    <div class="bereich-gitter">
      ${state.bereiche
        .map((b, i) => bereichKarte(b, auswahl.has(b.id), i, state.bereiche.length))
        .join('')}
    </div>

    ${schwere.length > 0 ? schwerstListe(schwere) : ''}

    <div class="reihe abstand">
      <button type="button" data-neu class="haupt">Vokabeln hinzufügen</button>
    </div>
  `;

  const richtungFeld = wurzel.querySelector('#richtung');
  richtungFeld.value = state.richtungWahl || 'de-en';
  richtungFeld.addEventListener('change', () => {
    state.richtungWahl = richtungFeld.value;
  });

  wurzel.querySelectorAll('[data-waehle]').forEach((kasten) => {
    kasten.addEventListener('change', () => {
      const id = kasten.dataset.waehle;
      state.auswahl = kasten.checked
        ? [...new Set([...state.auswahl, id])]
        : state.auswahl.filter((x) => x !== id);
      notify();
    });
  });

  aufKlick(wurzel, '[data-alle]', () => {
    state.auswahl = state.bereiche.map((b) => b.id);
    notify();
  });
  aufKlick(wurzel, '[data-keine]', () => {
    state.auswahl = [];
    notify();
  });
  aufKlick(wurzel, '[data-hoch]', (el) => bereichVerschieben(el.dataset.hoch, -1));
  aufKlick(wurzel, '[data-runter]', (el) => bereichVerschieben(el.dataset.runter, 1));
  aufKlick(wurzel, '[data-start]', () => starteAbfrage(state.auswahl, richtungFeld.value));
  aufKlick(wurzel, '[data-ueben]', (el) => starteAbfrage([el.dataset.ueben], richtungFeld.value));
  aufKlick(wurzel, '[data-bearbeiten]', (el) => {
    state.verwaltenBereich = el.dataset.bearbeiten;
    zeige('verwalten');
  });
  aufKlick(wurzel, '[data-neu]', () => {
    state.verwaltenBereich = null;
    zeige('verwalten');
  });
}

function bereichKarte(bereich, markiert, platz, anzahlBereiche) {
  const s = bereichStatistik(bereich.id);
  const zustand = s.geschafft ? 'freut' : 'schnute';
  const breite = s.quote === null ? 0 : Math.round(s.quote * 100);

  return `
    <article class="bereich ${s.geschafft ? 'geschafft' : ''}">
      <div class="bereich-kopf">
        <div class="bereich-biene">${biene(zustand, '', { pink: s.perfekt > 0 })}</div>
        <div style="flex:1; min-width:0">
          <h3 class="bereich-name">${esc(bereich.name)}</h3>
          <div class="bereich-zahl">
            ${s.anzahl} ${s.anzahl === 1 ? 'Vokabel' : 'Vokabeln'}
            ${s.geschafft ? ' &middot; geschafft' : ''}
          </div>
          ${sterneMarkup(s.perfekt)}
        </div>
        <div class="bereich-sortieren">
          <button type="button" data-hoch="${bereich.id}" ${platz === 0 ? 'disabled' : ''}
                  title="Nach oben" aria-label="${esc(bereich.name)} nach oben">&#9650;</button>
          <button type="button" data-runter="${bereich.id}" ${platz === anzahlBereiche - 1 ? 'disabled' : ''}
                  title="Nach unten" aria-label="${esc(bereich.name)} nach unten">&#9660;</button>
        </div>
      </div>

      <div class="balken" title="${
        s.quote === null ? 'noch nicht geübt' : `${s.sitzen} von ${s.anzahl} schon einmal richtig`
      }">
        <span style="width:${breite}%; background:${quoteFarbe(s.quote)}"></span>
      </div>
      <div class="balken-text">
        <span>${s.quote === null ? 'Noch nicht geübt' : breite + ' % richtig'}</span>
        <span>${s.falsch > 0 ? s.falsch + (s.falsch === 1 ? ' Fehler' : ' Fehler') : ''}</span>
      </div>

      <label class="auswahl-marke">
        <input type="checkbox" data-waehle="${bereich.id}" ${markiert ? 'checked' : ''}>
        Zum Üben auswählen
      </label>

      <div class="bereich-aktionen">
        <button type="button" class="haupt" data-ueben="${bereich.id}" ${s.anzahl === 0 ? 'disabled' : ''}>Üben</button>
        <button type="button" data-bearbeiten="${bereich.id}">Bearbeiten</button>
      </div>
    </article>`;
}

function schwerstListe(schwere) {
  return `
    <h2>Diese Wörter machen am meisten Ärger</h2>
    <div class="karte">
      <ul class="liste">
        ${schwere
          .map(
            (e) => `
          <li>
            <span class="de">${esc(e.vokabel.de)}</span>
            <span class="en">${esc(e.vokabel.en)}</span>
            <span class="zahl bereich-spalte">${esc(bereichName(e.vokabel.bereichId))}</span>
            <span class="zahl" style="color:var(--rot); font-weight:700">
              ${e.falsch}&times; falsch
            </span>
          </li>`
          )
          .join('')}
      </ul>
    </div>`;
}

function leerAnsicht() {
  return `
    <div class="leer">
      <div class="leer-biene">${biene('neutral')}</div>
      <h1>Noch keine Vokabeln</h1>
      <p>Fotografiere eine Vokabelseite, lade ein PDF hoch oder tippe die Wörter selbst ein.</p>
      <button type="button" class="haupt gross" data-neu>Los geht es</button>
    </div>`;
}

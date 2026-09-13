// Die eigentliche Abfrage: Frage, Eingabe, Rueckmeldung, Abschluss.

import {
  state,
  notify,
  zeige,
  melden,
  vokabelnVonBereichen,
  fortschrittBuchen,
  erfolgBuchen,
  fortschrittSichern,
  bereichName
} from '../state.js';
import { biene, sterneMarkup, belohnung } from '../bee.js';
import { esc, aufKlick } from '../dom.js';
import { sitzungStarten, aktuelleFrage, antworten, weiter, fortschritt, abschluss } from '../trainer.js';
import { vorlesen, kannVorlesen } from '../speech.js';

export function starteAbfrage(bereichIds, richtung) {
  const vokabeln = vokabelnVonBereichen(bereichIds);
  if (vokabeln.length === 0) {
    melden('info', 'In dieser Auswahl sind noch keine Vokabeln.');
    return;
  }
  state.sitzung = sitzungStarten(vokabeln, richtung || 'de-en', bereichIds);
  state.ansicht = 'abfrage';
  state.meldung = null;
  notify();
}

export function render(wurzel) {
  const sitzung = state.sitzung;
  if (!sitzung) {
    zeige('uebersicht');
    return;
  }
  if (sitzung.fertig) return abschlussAnsicht(wurzel, sitzung);
  if (sitzung.letzte) return rueckmeldungAnsicht(wurzel, sitzung);
  return frageAnsicht(wurzel, sitzung);
}

function kopfzeile(sitzung) {
  const f = fortschritt(sitzung);
  return `
    <div class="fortschritt-zeile">
      <span>${f.position} von ${f.gesamt}</span>
      <span class="runde-marke">${f.runde === 1 ? 'Durchgang 1' : 'Wiederholung ' + (f.runde - 1)}</span>
      <button type="button" class="leise" data-abbrechen>Beenden</button>
    </div>`;
}

function tonKnopf(text, sprache) {
  if (sprache !== 'en' || !kannVorlesen('en')) return '';
  return `<button type="button" class="ton-knopf" data-vorlesen="${esc(text)}" title="Vorlesen">
            &#128266; Anhören
          </button>`;
}

function frageAnsicht(wurzel, sitzung) {
  const frage = aktuelleFrage(sitzung);
  if (!frage) {
    weiter(sitzung);
    return notify();
  }

  wurzel.innerHTML = `
    <div class="abfrage">
      ${kopfzeile(sitzung)}
      <div class="abfrage-biene">${biene('neutral')}</div>

      <div class="karte frage-karte">
        <div class="frage-richtung">
          ${frage.richtung === 'de-en' ? 'Wie heißt das auf Englisch?' : 'Wie heißt das auf Deutsch?'}
        </div>
        <p class="frage-wort ${frage.vokabel.typ === 'satz' ? 'satz' : ''}">${esc(frage.frage)}</p>
        ${frage.vokabel.hinweis ? `<p class="frage-hinweis">${esc(frage.vokabel.hinweis)}</p>` : ''}
        <div class="reihe" style="justify-content:center">
          ${tonKnopf(frage.frage, frage.frageSprache)}
        </div>

        <form class="antwort-zeile" data-form>
          <input type="text" id="antwort" autocomplete="off" autocapitalize="off"
                 autocorrect="off" spellcheck="false" placeholder="Deine Antwort"
                 aria-label="Deine Antwort">
          <button type="submit" class="haupt">Prüfen</button>
        </form>
      </div>
    </div>`;

  bindeGemeinsames(wurzel, sitzung);

  const feld = wurzel.querySelector('#antwort');
  feld.focus();
  wurzel.querySelector('[data-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const ergebnis = antworten(sitzung, feld.value);
    if (!ergebnis) return;
    fortschrittBuchen(ergebnis.vokabelId, ergebnis.richtig);
    fortschrittSichern();
    notify();
  });
}

function rueckmeldungAnsicht(wurzel, sitzung) {
  const e = sitzung.letzte;
  const frage = aktuelleFrage(sitzung);
  const zustand = e.richtig ? 'freut' : 'schnute';

  wurzel.innerHTML = `
    <div class="abfrage">
      ${kopfzeile(sitzung)}
      <div class="abfrage-biene">${biene(zustand, e.richtig ? 'wippt' : 'zittert')}</div>

      <div class="karte frage-karte">
        <div class="frage-richtung">${esc(frage ? frage.frage : '')}</div>

        <div class="rueckmeldung ${e.richtig ? 'richtig' : 'falsch'}">
          <div class="titel">${e.richtig ? 'Richtig! Super gemacht.' : rueckmeldungTitel(e)}</div>
          ${
            e.richtig
              ? ''
              : `<div class="zeile">
                   <span class="etikett">Du hattest:</span>
                   <span class="wert durch">${esc(e.eingabe || '(nichts)')}</span>
                 </div>`
          }
          <div class="zeile">
            <span class="etikett">Richtig ist:</span>
            <span class="wert">${esc(e.loesungen.join('  oder  '))}</span>
            ${frage ? tonKnopf(e.loesung, frage.loesungSprache) : ''}
          </div>
        </div>

        <div class="reihe abstand" style="justify-content:center">
          <button type="button" class="haupt gross" data-weiter>Weiter</button>
        </div>
      </div>
    </div>`;

  bindeGemeinsames(wurzel, sitzung);

  const weiterKnopf = wurzel.querySelector('[data-weiter]');
  weiterKnopf.focus();
  weiterKnopf.addEventListener('click', () => {
    weiter(sitzung);
    if (sitzung.fertig) abschlussVerbuchen(sitzung);
    notify();
  });
}

function rueckmeldungTitel(e) {
  // "Fast" heisst nur: die Buchstaben stimmen. Gezaehlt wird es als voller Fehler.
  return {
    zeichen: 'Fast! Achte auf Punkt, Komma und die Leerzeichen.',
    grossklein: 'Fast! Achte auf groß und klein.',
    beides: 'Fast! Achte auf groß und klein und auf die Satzzeichen.'
  }[e.fast] || 'Leider falsch.';
}

function abschlussVerbuchen(sitzung) {
  const ergebnis = abschluss(sitzung);
  const perfekte = new Set(ergebnis.perfekteBereiche);
  // Ergebnis pro Bereich merken, damit der Abschlussbildschirm die neuen Sterne zeigt.
  sitzung.belohnungen = ergebnis.geschaffteBereiche.map((bereichId) => ({
    bereichId,
    aufAnhieb: perfekte.has(bereichId),
    ...erfolgBuchen(bereichId, perfekte.has(bereichId))
  }));
  fortschrittSichern();
}

/** Zeigt pro Bereich die Sterne und sagt, wenn gerade einer dazugekommen ist. */
function belohnungsBlock(sitzung) {
  const belohnungen = sitzung.belohnungen || [];
  if (belohnungen.length === 0) return '';

  return `
    <div class="karte" style="text-align:left; margin-bottom:16px">
      ${belohnungen
        .map(({ bereichId, perfekt, aufAnhieb }) => {
          const jetzt = belohnung(perfekt);
          const vorher = belohnung(perfekt - (aufAnhieb ? 1 : 0));
          const text = !aufAnhieb
            ? 'Geschafft! Ohne Fehler im ersten Durchgang wird die Biene pink.'
            : perfekt === 1
              ? 'Alles auf Anhieb richtig - deine Biene ist jetzt pink!'
              : vorher.sterne === 0
                ? 'Dein erster Stern!'
                : jetzt.stufe !== vorher.stufe
                  ? `Neue Stufe: ${jetzt.stufe}!`
                  : 'Ein Stern dazu!';

          return `
            <div class="belohnung-zeile">
              <span class="belohnung-biene">${biene('freut', '', { pink: perfekt > 0 })}</span>
              <span class="belohnung-name">${esc(bereichName(bereichId))}</span>
              ${sterneMarkup(perfekt, 26)}
              <span class="belohnung-text">${esc(text)}</span>
            </div>`;
        })
        .join('')}
    </div>`;
}

function abschlussAnsicht(wurzel, sitzung) {
  const e = abschluss(sitzung);

  wurzel.innerHTML = `
    <div class="abfrage">
      <div class="abfrage-biene">${biene('jubel', 'wippt')}</div>
      <h1>Alles richtig!</h1>
      <p class="unterzeile">
        ${
          e.allesAufAnhieb
            ? 'Im ersten Durchgang schon alles richtig - stark!'
            : `Du hast ${e.runden} Durchgänge gebraucht, jetzt sitzt alles.`
        }
      </p>

      ${belohnungsBlock(sitzung)}

      <div class="karte" style="text-align:left">
        <div class="reihe">
          <span class="marke-chip">${e.gesamt} Vokabeln geübt</span>
          <span class="marke-chip">${e.fehlerRunde1.length} im ersten Durchgang falsch</span>
        </div>

        ${
          e.fehlerRunde1.length > 0
            ? `<h2 style="margin-top:20px">Diese waren zuerst falsch</h2>
               <ul class="liste">
                 ${e.fehlerRunde1
                   .map(
                     (v) => `<li><span class="de">${esc(v.de)}</span><span class="en">${esc(v.en)}</span></li>`
                   )
                   .join('')}
               </ul>`
            : ''
        }
      </div>

      <div class="reihe abstand" style="justify-content:center">
        <button type="button" class="haupt gross" data-nochmal>Noch einmal üben</button>
        <button type="button" data-fertig>Zur Übersicht</button>
      </div>
    </div>`;

  aufKlick(wurzel, '[data-nochmal]', () => starteAbfrage(sitzung.bereichIds, sitzung.richtung));
  aufKlick(wurzel, '[data-fertig]', () => {
    state.sitzung = null;
    zeige('uebersicht');
  });
}

function bindeGemeinsames(wurzel, sitzung) {
  aufKlick(wurzel, '[data-vorlesen]', (el) => vorlesen(el.dataset.vorlesen, 'en', state.settings.stimme));
  aufKlick(wurzel, '[data-abbrechen]', () => {
    state.sitzung = null;
    zeige('uebersicht');
  });
}

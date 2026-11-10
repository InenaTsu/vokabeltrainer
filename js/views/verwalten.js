// Vokabeln pflegen: Bereiche anlegen, Woerter eintippen, Bild/PDF einlesen,
// Vokabeln in Worten beschreiben.

import {
  state,
  notify,
  melden,
  zeige,
  bereichAnlegen,
  bereichUmbenennen,
  bereichLoeschen,
  vokabelnHinzufuegen,
  vokabelAendern,
  vokabelLoeschen,
  vokabelnVonBereich,
  bereichStatistik,
  bereichName,
  bereichNachName,
  bereichZuruecksetzen
} from '../state.js';
import { esc, aufKlick, nurFinger } from '../dom.js';
import { biene, sterneMarkup } from '../bee.js';
import { dublettenSchluessel } from '../check.js';
import { vokabelnAusDateien, vokabelnAusBeschreibung } from '../anthropic.js';

// Zustand der laufenden Pruefansicht nach einem Import.
let importLaeuft = false;
let importErgebnis = null; // { bereich, vokabeln: [{de,en,typ,korrektur}], unklar: [] }
let importFehler = null; // { text, roh }
let fokusNeu = false; // nach dem Hinzufuegen wieder ins erste Eingabefeld springen
let zielWahl = '__neu'; // Bereichs-Id oder '__neu' -- Ziel der Pruefansicht

// Bilder/PDFs, die zum Auslesen bereitliegen (aus Datei-Dialog, Zwischenablage, Drag & Drop).
let vorlagen = []; // [{ datei, vorschau }]
let wunschText = '';
let bereichHinweisText = '';

const BEISPIELE = [
  'alle 7 Wochentage',
  'die 12 Monate',
  'die Zahlen 1 bis 20',
  'die wichtigsten Farben',
  'Familie: Mutter, Vater, Bruder, Schwester ...'
];

/* ---------- Vorlagen sammeln ---------- */

function vorlagenAufnehmen(dateien) {
  const brauchbar = [...dateien].filter(
    (d) => d.type.startsWith('image/') || d.type === 'application/pdf'
  );
  if (brauchbar.length === 0) {
    melden('info', 'Das war weder ein Bild noch ein PDF.');
    return;
  }
  for (const datei of brauchbar) {
    vorlagen.push({
      datei,
      vorschau: datei.type.startsWith('image/') ? URL.createObjectURL(datei) : null
    });
  }
  state.meldung = null;
  notify();
}

function vorlageEntfernen(index) {
  const weg = vorlagen[index];
  if (weg?.vorschau) URL.revokeObjectURL(weg.vorschau);
  vorlagen.splice(index, 1);
  notify();
}

function vorlagenLeeren() {
  for (const v of vorlagen) if (v.vorschau) URL.revokeObjectURL(v.vorschau);
  vorlagen = [];
}

// Einfuegen aus der Zwischenablage (Snipping Tool: Ausschnitt, dann Strg+V).
// Geht auf der Startseite und in einem geoeffneten Bereich.
document.addEventListener('paste', (e) => {
  if (state.ansicht !== 'verwalten' || importErgebnis || importLaeuft) return;
  const dateien = [...(e.clipboardData?.files || [])];
  if (dateien.length === 0) return;
  e.preventDefault();
  vorlagenAufnehmen(dateien);
});

/* ---------- Ablage-Baustein (Startseite und Bereichsansicht) ---------- */

// Am Handy gibt es weder Strg+V noch Ziehen und Ablegen. Statt beides grau danebenstehen
// zu lassen, steht dort nur der eine Weg, der funktioniert: Kamera bzw. Galerie.
function ablageBlock(aus) {
  const finger = nurFinger();
  return `
    <div class="ablage ${aus ? 'ablage-aus' : ''}" data-ablage tabindex="0">
      <div class="ablage-biene">${biene('neutral')}</div>
      ${
        finger
          ? `<p class="ablage-text"><strong>Vokabelseite fotografieren</strong></p>
             <p class="hinweis" style="margin:0">oder ein Bild aus der Galerie wählen</p>`
          : `<p class="ablage-text"><strong>Strg + V</strong> zum Einfügen aus der Zwischenablage</p>
             <p class="hinweis" style="margin:0">
               oder Bild hierher ziehen &middot;
               <button type="button" class="leise" data-waehlen ${aus}>Datei auswählen</button>
             </p>`
      }
      <input type="file" id="datei" accept="image/*,application/pdf" multiple
             capture="environment" hidden ${aus}>
    </div>
    ${vorlagen.length > 0 ? vorlagenGitter() : ''}`;
}

function ablageBinden(wurzel, hatSchluessel) {
  const dateiFeld = wurzel.querySelector('#datei');
  const ablage = wurzel.querySelector('[data-ablage]');
  if (!dateiFeld || !ablage) return;

  dateiFeld.addEventListener('change', () => {
    vorlagenAufnehmen(dateiFeld.files);
    dateiFeld.value = '';
  });
  ablage.addEventListener('click', (e) => {
    if (hatSchluessel && !e.target.closest('button')) dateiFeld.click();
  });
  ablage.addEventListener('dragover', (e) => {
    e.preventDefault();
    ablage.classList.add('ablage-drueber');
  });
  ablage.addEventListener('dragleave', () => ablage.classList.remove('ablage-drueber'));
  ablage.addEventListener('drop', (e) => {
    e.preventDefault();
    ablage.classList.remove('ablage-drueber');
    if (hatSchluessel) vorlagenAufnehmen(e.dataTransfer.files);
  });

  aufKlick(wurzel, '[data-waehlen]', () => dateiFeld.click());
  aufKlick(wurzel, '[data-vorlage-weg]', (el) => vorlageEntfernen(Number(el.dataset.vorlageWeg)));
}

export function render(wurzel) {
  if (importLaeuft) return ladeAnsicht(wurzel);
  if (importErgebnis) return pruefAnsicht(wurzel);
  if (state.verwaltenBereich) return bereichAnsicht(wurzel, state.verwaltenBereich);
  return startAnsicht(wurzel);
}

/* ---------- Einstieg ---------- */

function startAnsicht(wurzel) {
  const hatSchluessel = Boolean(state.settings.apiKey);
  const aus = hatSchluessel ? '' : 'disabled';

  wurzel.innerHTML = `
    <h1>Vokabeln hinzufügen</h1>
    <p class="unterzeile">Bild einfügen, in Worten beschreiben oder selbst eintippen.</p>

    ${
      hatSchluessel
        ? ''
        : `<div class="meldung info" style="margin:0 0 18px">
             Für Bilder und Beschreibungen fehlt noch der API-Schlüssel.
             <button type="button" data-zu-einstellungen>Jetzt eintragen</button>
           </div>`
    }

    <div class="karte">
      <h2 style="margin-top:0">Aus Bild oder PDF</h2>
      <p class="hinweis" style="margin-top:0">
        ${
          nurFinger()
            ? 'Foto der Buchseite oder ein PDF.'
            : 'Foto der Buchseite, Ausschnitt aus dem Snipping Tool oder ein PDF.'
        }
        Stehen nur die englischen Wörter darauf, werden die deutschen ergänzt.
      </p>

      ${ablageBlock(aus)}

      <div class="feld abstand">
        <label for="bereich-hinweis">Bereich (optional)</label>
        <input type="text" id="bereich-hinweis" value="${esc(bereichHinweisText)}"
               placeholder="z. B. Farben, Wochentage, Unit 3">
        <p class="hinweis">Leer lassen: dann schlägt Claude selbst einen Namen vor. Gilt für beide Wege.</p>
      </div>

      <button type="button" class="haupt gross" data-lesen ${vorlagen.length === 0 || aus ? 'disabled' : ''}>
        ${vorlagen.length > 1 ? `${vorlagen.length} Bilder auslesen` : 'Vokabeln auslesen'}
      </button>
    </div>

    <h2>In Worten beschreiben</h2>
    <div class="karte">
      <p class="hinweis" style="margin-top:0">
        Sag einfach, was du brauchst - die Liste wird dann erzeugt.
      </p>
      <div class="feld">
        <textarea id="wunsch" rows="2" ${aus}
                  placeholder="alle 7 Wochentage">${esc(wunschText)}</textarea>
      </div>
      <div class="reihe" style="margin-bottom:14px">
        ${BEISPIELE.map((b) => `<button type="button" class="chip" data-beispiel="${esc(b)}" ${aus}>${esc(b)}</button>`).join('')}
      </div>
      <button type="button" class="haupt gross" data-erzeugen ${aus}>Vokabeln erzeugen</button>
    </div>

    <h2>Selbst eintippen</h2>
    <div class="karte">
      <div class="feld">
        <label for="neu-bereich">Neuer Bereich</label>
        <div class="reihe">
          <input type="text" id="neu-bereich" placeholder="Name des Bereichs" style="flex:1">
          <button type="button" class="haupt" data-neuer-bereich>Anlegen</button>
        </div>
      </div>
      ${
        state.bereiche.length > 0
          ? `<p class="hinweis">Oder einen vorhandenen Bereich öffnen:</p>
             <div class="reihe">
               ${state.bereiche
                 .map(
                   (b) =>
                     `<button type="button" data-oeffne="${b.id}">${esc(b.name)}
                        <span class="zahl">(${vokabelnVonBereich(b.id).length})</span>
                      </button>`
                 )
                 .join('')}
             </div>`
          : ''
      }
    </div>

    ${importFehler ? fehlerBlock(importFehler) : ''}
  `;

  const hinweisFeld = wurzel.querySelector('#bereich-hinweis');
  hinweisFeld.addEventListener('input', () => {
    bereichHinweisText = hinweisFeld.value;
  });

  const wunschFeld = wurzel.querySelector('#wunsch');
  wunschFeld.addEventListener('input', () => {
    wunschText = wunschFeld.value;
  });

  ablageBinden(wurzel, hatSchluessel);
  aufKlick(wurzel, '[data-zu-einstellungen]', () => zeige('einstellungen'));
  aufKlick(wurzel, '[data-oeffne]', (el) => {
    state.verwaltenBereich = el.dataset.oeffne;
    notify();
  });
  aufKlick(wurzel, '[data-fehler-weg]', () => {
    importFehler = null;
    notify();
  });

  aufKlick(wurzel, '[data-beispiel]', (el) => {
    wunschText = el.dataset.beispiel;
    notify();
  });

  aufKlick(wurzel, '[data-neuer-bereich]', async () => {
    const feld = wurzel.querySelector('#neu-bereich');
    const name = feld.value.trim();
    if (!name) return melden('info', 'Bitte einen Namen für den Bereich eingeben.');
    const schonDa = bereichNachName(name);
    const bereich = await bereichAnlegen(name);
    state.verwaltenBereich = bereich.id;
    notify();
    if (schonDa) melden('info', `„${schonDa.name}" gibt es schon - hier ist der Bereich.`);
  });

  aufKlick(wurzel, '[data-lesen]', () =>
    importStarten(() =>
      vokabelnAusDateien(
        vorlagen.map((v) => v.datei),
        { apiKey: state.settings.apiKey, modell: state.settings.modell, bereichHinweis: bereichHinweisText.trim() }
      )
    )
  );

  aufKlick(wurzel, '[data-erzeugen]', () => {
    if (!wunschText.trim()) return melden('info', 'Bitte zuerst aufschreiben, welche Vokabeln du brauchst.');
    importStarten(() =>
      vokabelnAusBeschreibung(wunschText, {
        apiKey: state.settings.apiKey,
        modell: state.settings.modell,
        bereichHinweis: bereichHinweisText.trim()
      })
    );
  });
}

function vorlagenGitter() {
  return `
    <div class="vorlagen">
      ${vorlagen
        .map(
          (v, i) => `
        <figure class="vorlage">
          ${
            v.vorschau
              ? `<img src="${v.vorschau}" alt="Vorlage ${i + 1}">`
              : '<div class="vorlage-pdf">PDF</div>'
          }
          <button type="button" class="gefahr" data-vorlage-weg="${i}" title="Entfernen">&times;</button>
          <figcaption>${esc(v.datei.name || 'Ausschnitt')}</figcaption>
        </figure>`
        )
        .join('')}
    </div>`;
}

function fehlerBlock(fehler) {
  return `
    <div class="karte abstand" style="border-color:var(--rot)">
      <h2 style="margin-top:0; color:var(--rot)">Das hat nicht geklappt</h2>
      <p>${esc(fehler.text)}</p>
      ${fehler.roh ? `<p class="hinweis">Antwort von Claude:</p><div class="roh-antwort">${esc(fehler.roh)}</div>` : ''}
      <div class="reihe abstand"><button type="button" data-fehler-weg>Verstanden</button></div>
    </div>`;
}

async function importStarten(auftrag, zielBereichId = '__neu') {
  importLaeuft = true;
  importFehler = null;
  zielWahl = zielBereichId;
  notify();
  try {
    const ergebnis = await auftrag();
    importErgebnis = {
      bereich: bereichHinweisText.trim() || ergebnis.bereich,
      vokabeln: ergebnis.vokabeln,
      unklar: ergebnis.unklar || []
    };
  } catch (fehler) {
    importFehler = { text: fehler?.message || String(fehler), roh: fehler?.roh || '' };
  } finally {
    importLaeuft = false;
    notify();
  }
}

function ladeAnsicht(wurzel) {
  wurzel.innerHTML = `
    <div class="leer">
      <div class="leer-biene">${biene('neutral', 'wippt')}</div>
      <h1>Die Biene arbeitet...</h1>
      <p>Das dauert einen kleinen Moment.</p>
    </div>`;
}

/* ---------- Pruefansicht nach dem Import ---------- */

/**
 * Vokabeln, die schon vorhanden sind. Verglichen wird die englische Seite ohne
 * Gross-/Kleinschreibung und ohne Artikel: "a girl" und "girl" sind dieselbe Vokabel.
 * Es gilt immer der zuerst eingetragene Eintrag -- spaetere werden uebersprungen,
 * auch wenn sie zweimal in derselben Vorlage stehen.
 */
function schonVorhanden(zielBereichId) {
  const bekannt = new Set(
    zielBereichId === '__neu'
      ? []
      : vokabelnVonBereich(zielBereichId).map((v) => dublettenSchluessel(v.en))
  );
  const treffer = new Set();
  importErgebnis.vokabeln.forEach((v, i) => {
    const schluessel = dublettenSchluessel(v.en);
    if (!schluessel) return;
    if (bekannt.has(schluessel)) treffer.add(i);
    else bekannt.add(schluessel);
  });
  return treffer;
}

function pruefAnsicht(wurzel) {
  const ziele = state.bereiche
    .map((b) => `<option value="${b.id}" ${b.id === zielWahl ? 'selected' : ''}>${esc(b.name)}</option>`)
    .join('');
  const korrekturen = importErgebnis.vokabeln.filter((v) => v.korrektur);
  const doppelt = schonVorhanden(zielWahl);
  const neueAnzahl = importErgebnis.vokabeln.length - doppelt.size;
  // Kam der Import aus einem geoeffneten Bereich, steht das Ziel fest -- kein Auswahlfeld,
  // damit man nicht versehentlich einen zweiten Bereich anlegt.
  const zielFest = zielWahl !== '__neu' && Boolean(state.bereiche.find((b) => b.id === zielWahl));

  wurzel.innerHTML = `
    <h1>Stimmt das so?</h1>
    <p class="unterzeile">${importErgebnis.vokabeln.length} Vokabeln. Korrigiere, was nicht passt, und lösche, was nicht dazugehört.</p>

    ${
      doppelt.size > 0
        ? `<div class="meldung info" style="margin:0 0 18px">
             ${doppelt.size === 1 ? 'Eine Vokabel steht' : doppelt.size + ' Vokabeln stehen'}
             in diesem Bereich schon drin - ${doppelt.size === 1 ? 'sie wird' : 'sie werden'}
             nicht doppelt gespeichert. Es ${neueAnzahl === 1 ? 'kommt 1 neue' : 'kommen ' + neueAnzahl + ' neue'} dazu.
           </div>`
        : ''
    }

    ${
      importErgebnis.unklar.length > 0
        ? `<div class="karte abstand" style="border-color:var(--blau); margin-bottom:18px">
             <h2 style="margin-top:0; color:var(--blau)">Hier bin ich mir nicht sicher</h2>
             <ul class="liste">
               ${importErgebnis.unklar.map((f) => `<li><span class="de">${esc(f)}</span></li>`).join('')}
             </ul>
             <p class="hinweis">Diese Vokabeln fehlen unten. Trag sie von Hand nach oder schick ein schärferes Bild.</p>
           </div>`
        : ''
    }

    ${
      korrekturen.length > 0
        ? `<div class="karte" style="border-color:var(--honig); margin-bottom:18px">
             <h2 style="margin-top:0">Das habe ich korrigiert</h2>
             <ul class="liste">
               ${korrekturen
                 .map(
                   (v) => `<li><span class="de">${esc(v.de)} &ndash; ${esc(v.en)}</span>
                             <span class="zahl" style="flex:1">${esc(v.korrektur)}</span></li>`
                 )
                 .join('')}
             </ul>
           </div>`
        : ''
    }

    <div class="karte">
      ${
        zielFest
          ? `<div class="feld">
               <label>Wohin damit?</label>
               <p style="margin:0"><span class="marke-chip">${esc(bereichName(zielWahl))}</span></p>
             </div>`
          : `<div class="feld">
               <label for="ziel">Wohin damit?</label>
               <select id="ziel">
                 <option value="__neu" ${zielWahl === '__neu' ? 'selected' : ''}>Neuer Bereich</option>
                 ${ziele}
               </select>
             </div>
             <div class="feld" id="neu-name-feld">
               <label for="ziel-name">Name des neuen Bereichs</label>
               <input type="text" id="ziel-name" value="${esc(importErgebnis.bereich)}">
             </div>`
      }

      <div id="paare">
        ${importErgebnis.vokabeln
          .map(
            (v, i) => `
          <div class="paar-zeile ${doppelt.has(i) ? 'paar-doppelt' : ''}"
               ${doppelt.has(i) ? 'title="Steht in diesem Bereich schon drin"' : ''}>
            <input type="text" data-de="${i}" value="${esc(v.de)}" aria-label="Deutsch">
            <input type="text" data-en="${i}" value="${esc(v.en)}" aria-label="Englisch">
            <button type="button" class="gefahr" data-weg="${i}" title="Zeile löschen">&times;</button>
          </div>`
          )
          .join('')}
      </div>

      <div class="reihe abstand">
        <button type="button" class="haupt gross" data-speichern>Speichern</button>
        <button type="button" class="leise" data-verwerfen>Verwerfen</button>
      </div>
    </div>`;

  const ziel = wurzel.querySelector('#ziel');
  if (ziel) {
    const neuFeld = wurzel.querySelector('#neu-name-feld');
    neuFeld.style.display = zielWahl === '__neu' ? '' : 'none';
    ziel.addEventListener('change', () => {
      zielWahl = ziel.value; // neu rendern, damit die Dubletten-Warnung passt
      notify();
    });
  }

  wurzel.querySelectorAll('[data-de]').forEach((el) =>
    el.addEventListener('input', () => {
      importErgebnis.vokabeln[Number(el.dataset.de)].de = el.value;
    })
  );
  wurzel.querySelectorAll('[data-en]').forEach((el) =>
    el.addEventListener('input', () => {
      importErgebnis.vokabeln[Number(el.dataset.en)].en = el.value;
    })
  );

  aufKlick(wurzel, '[data-weg]', (el) => {
    importErgebnis.vokabeln.splice(Number(el.dataset.weg), 1);
    if (importErgebnis.vokabeln.length === 0) {
      importErgebnis = null;
      melden('info', 'Es ist nichts mehr übrig geblieben.');
    }
    notify();
  });

  aufKlick(wurzel, '[data-verwerfen]', () => {
    importErgebnis = null;
    notify();
  });

  aufKlick(wurzel, '[data-speichern]', async () => {
    const uebersprungen = schonVorhanden(zielWahl);
    const paare = importErgebnis.vokabeln.filter(
      (v, i) => v.de.trim() && v.en.trim() && !uebersprungen.has(i)
    );
    if (paare.length === 0) {
      return melden('info', 'Es gibt nichts Neues zu speichern - alles steht schon in diesem Bereich.');
    }

    let bereichId = zielWahl;
    if (bereichId === '__neu') {
      const name = wurzel.querySelector('#ziel-name').value.trim() || 'Neue Vokabeln';
      // bereichAnlegen gibt einen gleichnamigen Bereich zurueck, statt ihn doppelt anzulegen.
      bereichId = (await bereichAnlegen(name, 'foto')).id;
    }
    await vokabelnHinzufuegen(bereichId, paare);
    importErgebnis = null;
    zielWahl = '__neu';
    vorlagenLeeren();
    wunschText = '';
    bereichHinweisText = '';
    state.verwaltenBereich = bereichId;

    const uebersprungenText =
      uebersprungen.size === 0
        ? ''
        : uebersprungen.size === 1
          ? ' Eine war schon drin und wurde übersprungen.'
          : ` ${uebersprungen.size} waren schon drin und wurden übersprungen.`;
    melden(
      'gut',
      `${paare.length === 1 ? 'Eine Vokabel' : paare.length + ' Vokabeln'} gespeichert.${uebersprungenText}`
    );
  });
}

/* ---------- Ein Bereich im Detail ---------- */

function bereichAnsicht(wurzel, bereichId) {
  const bereich = state.bereiche.find((b) => b.id === bereichId);
  if (!bereich) {
    state.verwaltenBereich = null;
    return notify();
  }
  const vokabeln = vokabelnVonBereich(bereichId);
  const s = bereichStatistik(bereichId);
  const hatSchluessel = Boolean(state.settings.apiKey);
  const aus = hatSchluessel ? '' : 'disabled';

  wurzel.innerHTML = `
    <div class="reihe">
      <button type="button" class="leise" data-zurueck>&larr; Alle Bereiche</button>
    </div>

    <div class="reihe" style="align-items:flex-start; gap:14px; margin:10px 0 4px">
      <div class="bereich-biene">${biene(s.geschafft ? 'freut' : 'schnute', '', { pink: s.perfekt > 0 })}</div>
      <div style="flex:1">
        <h1 style="margin:0">${esc(bereich.name)}</h1>
        <p class="unterzeile" style="margin:2px 0 0">
          ${vokabeln.length} ${vokabeln.length === 1 ? 'Vokabel' : 'Vokabeln'}
          ${s.geschafft ? `&middot; ${s.erfolge}&times; komplett richtig` : ''}
          ${s.perfekt > 0 ? `&middot; ${s.perfekt}&times; ohne Fehler` : ''}
        </p>
        ${sterneMarkup(s.perfekt)}
      </div>
    </div>

    <div class="karte abstand">
      <div class="feld">
        <label for="name">Name des Bereichs</label>
        <div class="reihe">
          <input type="text" id="name" value="${esc(bereich.name)}" style="flex:1">
          <button type="button" data-umbenennen>Speichern</button>
        </div>
      </div>
    </div>

    <h2>Mehr Vokabeln aus Bild oder PDF</h2>
    <div class="karte">
      <p class="hinweis" style="margin-top:0">
        Noch ein Bild mit weiteren Wörtern? Kommt direkt in diesen Bereich dazu.
        Was schon drin ist, wird nicht doppelt gespeichert.
      </p>
      ${
        hatSchluessel
          ? ''
          : `<div class="meldung info" style="margin:0 0 14px">
               Dafür fehlt noch der API-Schlüssel.
               <button type="button" data-zu-einstellungen>Jetzt eintragen</button>
             </div>`
      }
      ${ablageBlock(aus)}
      <div class="reihe abstand">
        <button type="button" class="haupt" data-lesen-bereich ${vorlagen.length === 0 || aus ? 'disabled' : ''}>
          ${vorlagen.length > 1 ? `${vorlagen.length} Bilder auslesen` : 'Vokabeln auslesen'}
        </button>
      </div>

      <div class="feld abstand" style="margin-bottom:0">
        <label for="wunsch-bereich">Oder in Worten beschreiben</label>
        <div class="reihe">
          <input type="text" id="wunsch-bereich" style="flex:1" ${aus}
                 placeholder="z. B. noch 5 weitere Farben" value="${esc(wunschText)}">
          <button type="button" data-erzeugen-bereich ${aus}>Erzeugen</button>
        </div>
      </div>
    </div>

    <h2>Neue Vokabel eintippen</h2>
    <div class="karte">
      <form class="paar-zeile" data-neu-form style="margin:0">
        <input type="text" id="neu-de" placeholder="Deutsch" aria-label="Deutsch">
        <input type="text" id="neu-en" placeholder="Englisch" aria-label="Englisch">
        <button type="submit" class="haupt">Hinzufügen</button>
      </form>
      <p class="hinweis">Mehrere richtige Lösungen mit Schrägstrich trennen: the bike / the bicycle</p>
    </div>

    <h2>Vokabeln</h2>
    <div class="karte">
      ${
        vokabeln.length === 0
          ? '<p class="hinweis" style="margin:0">Noch nichts drin.</p>'
          : vokabeln
              .map(
                (v) => `
        <div class="paar-zeile">
          <input type="text" data-v-de="${v.id}" value="${esc(v.de)}" aria-label="Deutsch">
          <input type="text" data-v-en="${v.id}" value="${esc(v.en)}" aria-label="Englisch">
          <button type="button" class="gefahr" data-v-weg="${v.id}" title="Löschen">&times;</button>
        </div>`
              )
              .join('')
      }
    </div>

    <div class="reihe abstand">
      <button type="button" data-bereich-zuruecksetzen ${s.geschafft || s.antworten > 0 ? '' : 'disabled'}>
        Übungen dieses Bereichs zurücksetzen
      </button>
      <button type="button" class="gefahr reihe-ende" data-bereich-weg>Bereich löschen</button>
    </div>`;

  ablageBinden(wurzel, hatSchluessel);
  aufKlick(wurzel, '[data-zu-einstellungen]', () => zeige('einstellungen'));

  const wunschFeld = wurzel.querySelector('#wunsch-bereich');
  wunschFeld.addEventListener('input', () => {
    wunschText = wunschFeld.value;
  });

  aufKlick(wurzel, '[data-lesen-bereich]', () =>
    importStarten(
      () =>
        vokabelnAusDateien(
          vorlagen.map((v) => v.datei),
          { apiKey: state.settings.apiKey, modell: state.settings.modell, bereichHinweis: bereich.name }
        ),
      bereichId
    )
  );

  aufKlick(wurzel, '[data-erzeugen-bereich]', () => {
    if (!wunschText.trim()) return melden('info', 'Bitte zuerst aufschreiben, welche Vokabeln du brauchst.');
    importStarten(
      () =>
        vokabelnAusBeschreibung(wunschText, {
          apiKey: state.settings.apiKey,
          modell: state.settings.modell,
          bereichHinweis: bereich.name
        }),
      bereichId
    );
  });

  aufKlick(wurzel, '[data-zurueck]', () => {
    state.verwaltenBereich = null;
    wunschText = '';
    vorlagenLeeren();
    notify();
  });

  aufKlick(wurzel, '[data-umbenennen]', async () => {
    const name = wurzel.querySelector('#name').value.trim();
    if (!name) return melden('info', 'Der Name darf nicht leer sein.');
    await bereichUmbenennen(bereichId, name);
    melden('gut', 'Name gespeichert.');
  });

  wurzel.querySelector('[data-neu-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const de = wurzel.querySelector('#neu-de');
    const en = wurzel.querySelector('#neu-en');
    if (!de.value.trim() || !en.value.trim()) return melden('info', 'Bitte beide Felder ausfüllen.');

    // "a girl" und "girl" gelten als dieselbe Vokabel -- der erste Eintrag bleibt.
    const schluessel = dublettenSchluessel(en.value);
    const schonDa = vokabeln.find((v) => dublettenSchluessel(v.en) === schluessel);
    if (schonDa) {
      return melden('info', `„${schonDa.en}" steht in diesem Bereich schon drin (${schonDa.de}).`);
    }

    fokusNeu = true;
    await vokabelnHinzufuegen(bereichId, [{ de: de.value, en: en.value }]);
  });

  wurzel.querySelectorAll('[data-v-de]').forEach((el) =>
    el.addEventListener('change', () => vokabelAendern(el.dataset.vDe, { de: el.value }))
  );
  wurzel.querySelectorAll('[data-v-en]').forEach((el) =>
    el.addEventListener('change', () => vokabelAendern(el.dataset.vEn, { en: el.value }))
  );

  aufKlick(wurzel, '[data-v-weg]', (el) => vokabelLoeschen(el.dataset.vWeg));

  aufKlick(wurzel, '[data-bereich-zuruecksetzen]', async () => {
    if (!confirm(`Übungen von „${bereich.name}" zurücksetzen?\n\nFehler, Biene und Sterne fangen wieder bei null an. Die ${vokabeln.length} Vokabeln bleiben erhalten.`)) return;
    await bereichZuruecksetzen(bereichId);
    melden('gut', `„${bereich.name}" fängt wieder bei null an.`);
  });

  aufKlick(wurzel, '[data-bereich-weg]', async () => {
    if (!confirm(`"${bereich.name}" mit allen ${vokabeln.length} Vokabeln wirklich löschen?`)) return;
    await bereichLoeschen(bereichId);
    state.verwaltenBereich = null;
    melden('info', 'Bereich gelöscht.');
  });

  if (fokusNeu) {
    fokusNeu = false;
    wurzel.querySelector('#neu-de')?.focus();
  }
}

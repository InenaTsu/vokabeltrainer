// Einstellungen: API-Schlüssel, Stimme, Sicherung.

import {
  state,
  settingsSetzen,
  melden,
  notify,
  laden,
  uebungenZuruecksetzen,
  doppelteBereiche,
  bereicheZusammenfuehren,
  sicherungZusammenfuehren
} from '../state.js';
import { esc, aufKlick } from '../dom.js';
import { stimmenFuer, vorlesen } from '../speech.js';
import { exportieren, importieren } from '../storage.js';

/** "1 Bereich" statt "1 Bereiche" -- die Meldung liest auch ein Kind. */
function anzahl(n, ein, viele) {
  return `${n} ${n === 1 ? ein : viele}`;
}

/**
 * Karte zum Zusammenfuehren gleichnamiger Bereiche. Sie erscheint nur, wenn es welche
 * gibt -- neue koennen nicht mehr entstehen, aber vor dem Fix angelegte liegen noch da.
 */
function doppelteKarte(gruppen) {
  if (gruppen.length === 0) return '';
  const liste = gruppen
    .map((g) => `<li>„${esc(g[0].name)}" — ${g.length} Mal</li>`)
    .join('');
  return `
    <h2>Doppelte Bereiche</h2>
    <div class="karte">
      <p class="hinweis" style="margin-top:0">
        Diese Bereiche gibt es mehrfach mit demselben Namen:
      </p>
      <ul class="hinweis" style="margin-top:0">${liste}</ul>
      <p class="hinweis">
        Beim Zusammenführen bleibt der zuerst angelegte Bereich, alle Vokabeln wandern
        dorthin. Vokabeln, die dabei doppelt wären, fallen weg — ihre Fehler und Treffer
        werden mitgezählt. <strong>Es geht keine Vokabel verloren.</strong>
      </p>
      <button type="button" class="haupt" data-zusammenfuehren>Bereiche zusammenführen</button>
    </div>`;
}

export function render(wurzel) {
  const stimmen = stimmenFuer('en');
  const gruppen = doppelteBereiche();

  wurzel.innerHTML = `
    <h1>Einstellungen</h1>
    <p class="unterzeile">Gilt nur auf diesem Gerät.</p>

    <div class="karte">
      <h2 style="margin-top:0">API-Schlüssel für das Auslesen von Fotos</h2>
      <p class="hinweis" style="margin-top:0">
        Nur nötig, um Vokabeln aus Foto oder PDF zu lesen. Das Üben selbst braucht weder
        Schlüssel noch Internet. Der Schlüssel bleibt auf diesem Gerät.
      </p>
      <div class="feld">
        <label for="schluessel">Schlüssel</label>
        <input type="password" id="schluessel" value="${esc(state.settings.apiKey)}"
               placeholder="sk-ant-..." autocomplete="off">
      </div>
      <div class="feld">
        <label for="modell">Modell</label>
        <input type="text" id="modell" value="${esc(state.settings.modell)}">
        <p class="hinweis">Standard: claude-opus-5</p>
      </div>
      <button type="button" class="haupt" data-speichern-key>Speichern</button>
    </div>

    <h2>Stimme zum Vorlesen</h2>
    <div class="karte">
      ${
        stimmen.length === 0
          ? '<p class="hinweis" style="margin:0">Dieses Gerät hat keine englische Stimme installiert. Der Lautsprecher-Knopf bleibt dann aus.</p>'
          : `<div class="feld">
               <label for="stimme">Englische Stimme</label>
               <select id="stimme">
                 <option value="">Automatisch</option>
                 ${stimmen
                   .map(
                     (s) =>
                       `<option value="${esc(s.name)}" ${
                         s.name === state.settings.stimme ? 'selected' : ''
                       }>${esc(s.name)} (${esc(s.lang)})</option>`
                   )
                   .join('')}
               </select>
             </div>
             <div class="reihe">
               <button type="button" data-probe>Probe anhören</button>
               <button type="button" class="haupt" data-speichern-stimme>Speichern</button>
             </div>`
      }
    </div>

    ${doppelteKarte(gruppen)}

    <h2>Übungen zurücksetzen</h2>
    <div class="karte">
      <p class="hinweis" style="margin-top:0">
        Setzt alle Ergebnisse zurück: Fehlerzähler, Prozentbalken, Bienen und Sterne fangen
        wieder bei null an. <strong>Die Vokabeln bleiben alle erhalten.</strong>
      </p>
      <button type="button" class="gefahr" data-zuruecksetzen>Alle Übungen zurücksetzen</button>
    </div>

    <h2>Sicherung</h2>
    <div class="karte">
      <p class="hinweis" style="margin-top:0">
        Alle Vokabeln liegen nur auf diesem Gerät. Jedes Gerät hat seinen eigenen Bestand -
        so kommen neue Vokabeln vom Computer aufs Handy: hier herunterladen, die Datei
        aufs andere Gerät bringen und dort hinzufügen.
      </p>
      <div class="reihe">
        <button type="button" data-export>Sicherung herunterladen</button>
      </div>

      <div class="feld abstand">
        <label for="sicherung">Sicherungsdatei von einem anderen Gerät</label>
        <input type="file" id="sicherung" accept="application/json">
      </div>

      <div class="reihe">
        <button type="button" class="haupt" data-vereinen>Vokabeln hinzufügen</button>
        <button type="button" class="gefahr" data-import>Alles ersetzen</button>
      </div>
      <p class="hinweis">
        <strong>Vokabeln hinzufügen</strong> ist der normale Weg: Neues kommt dazu, alles
        Vorhandene bleibt, und Sterne und Fortschritt gehen nicht verloren.
        <strong>Alles ersetzen</strong> löscht vorher den ganzen Bestand dieses Geräts -
        nur sinnvoll, wenn ein Gerät neu aufgesetzt wurde.
      </p>
    </div>
  `;

  aufKlick(wurzel, '[data-speichern-key]', async () => {
    await settingsSetzen({
      apiKey: wurzel.querySelector('#schluessel').value.trim(),
      modell: wurzel.querySelector('#modell').value.trim() || 'claude-opus-5'
    });
    melden('gut', 'Gespeichert.');
  });

  aufKlick(wurzel, '[data-speichern-stimme]', async () => {
    await settingsSetzen({ stimme: wurzel.querySelector('#stimme').value });
    melden('gut', 'Stimme gespeichert.');
  });

  aufKlick(wurzel, '[data-probe]', () => {
    vorlesen('Good morning! How are you today?', 'en', wurzel.querySelector('#stimme').value);
  });

  aufKlick(wurzel, '[data-zuruecksetzen]', async () => {
    if (!confirm('Alle Übungsergebnisse zurücksetzen?\n\nFehler, Bienen und Sterne fangen wieder bei null an. Die Vokabeln bleiben erhalten.')) return;
    try {
      await uebungenZuruecksetzen();
      melden('gut', 'Alle Übungen wurden zurückgesetzt. Die Vokabeln sind noch da.');
    } catch (fehler) {
      melden('fehler', 'Zurücksetzen fehlgeschlagen: ' + (fehler?.message || fehler));
    }
  });

  aufKlick(wurzel, '[data-zusammenfuehren]', async () => {
    const namen = gruppen.map((g) => `„${g[0].name}"`).join(', ');
    if (!confirm(`Gleichnamige Bereiche zusammenführen?\n\nBetroffen: ${namen}\n\nDie Vokabeln bleiben alle erhalten.`)) return;
    try {
      const bericht = await bereicheZusammenfuehren();
      const doppelt =
        bericht.doppelt > 0
          ? ` ${anzahl(bericht.doppelt, 'doppelte Vokabel fiel', 'doppelte Vokabeln fielen')} weg.`
          : '';
      melden(
        'gut',
        `Zusammengeführt: ${anzahl(bericht.entfernt, 'Bereich', 'Bereiche')} aufgelöst, ` +
          `${anzahl(bericht.verschoben, 'Vokabel', 'Vokabeln')} umgezogen.${doppelt}`
      );
    } catch (fehler) {
      melden('fehler', 'Zusammenführen fehlgeschlagen: ' + (fehler?.message || fehler));
    }
  });

  aufKlick(wurzel, '[data-export]', async () => {
    try {
      const text = await exportieren();
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `vokabeltrainer-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (fehler) {
      melden('fehler', 'Sicherung fehlgeschlagen: ' + (fehler?.message || fehler));
    }
  });

  aufKlick(wurzel, '[data-vereinen]', async () => {
    const datei = wurzel.querySelector('#sicherung').files[0];
    if (!datei) return melden('info', 'Bitte zuerst eine Sicherungsdatei auswählen.');
    try {
      const b = await sicherungZusammenfuehren(await datei.text());
      const teile = [];
      if (b.neueVokabeln > 0) teile.push(anzahl(b.neueVokabeln, 'neue Vokabel', 'neue Vokabeln'));
      if (b.neueBereiche > 0) teile.push(anzahl(b.neueBereiche, 'neuer Bereich', 'neue Bereiche'));
      if (b.schonDa > 0) teile.push(b.schonDa === 1 ? '1 war schon da' : `${b.schonDa} waren schon da`);
      melden('gut', teile.length > 0 ? 'Hinzugefügt: ' + teile.join(', ') + '.' : 'Es gab nichts Neues.');
    } catch (fehler) {
      if (fehler?.sanft) melden('info', fehler.message);
      else melden('fehler', 'Die Datei konnte nicht gelesen werden: ' + (fehler?.message || fehler));
    }
    notify();
  });

  aufKlick(wurzel, '[data-import]', async () => {
    const datei = wurzel.querySelector('#sicherung').files[0];
    if (!datei) return melden('info', 'Bitte zuerst eine Sicherungsdatei auswählen.');
    if (!confirm('Alle Vokabeln, Sterne und der Fortschritt auf diesem Gerät werden gelöscht und durch die Datei ersetzt. Fortfahren?')) return;
    try {
      await importieren(await datei.text());
      await laden();
      melden('gut', 'Sicherung eingespielt.');
    } catch (fehler) {
      melden('fehler', 'Die Datei konnte nicht gelesen werden: ' + (fehler?.message || fehler));
    }
    notify();
  });
}

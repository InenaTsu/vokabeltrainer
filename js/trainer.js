// Ablauf einer Abfrage (Abschnitt 5 der Spezifikation).
// Durchgang 1 fragt alles ab; danach werden nur noch die falschen Vokabeln
// wiederholt, bis keine mehr uebrig ist.

import { istRichtig, fastRichtig } from './check.js';

function mischen(liste) {
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

/**
 * @param {Array} vokabeln Vokabel-Objekte der gewaehlten Bereiche
 * @param {'de-en'|'en-de'|'mix'} richtung
 * @param {string[]} bereichIds
 */
export function sitzungStarten(vokabeln, richtung, bereichIds) {
  const nachId = new Map(vokabeln.map((v) => [v.id, v]));
  const richtungen = {};
  for (const v of vokabeln) {
    richtungen[v.id] = richtung === 'mix' ? (Math.random() < 0.5 ? 'de-en' : 'en-de') : richtung;
  }
  return {
    bereichIds: [...bereichIds],
    richtung,
    nachId,
    richtungen,
    runde: 1,
    queue: mischen(vokabeln.map((v) => v.id)),
    index: 0,
    falsch: [],
    fehlerRunde1: new Set(),
    gesamtRunde1: vokabeln.length,
    letzte: null,
    fertig: vokabeln.length === 0
  };
}

export function aktuelleFrage(sitzung) {
  if (sitzung.fertig) return null;
  const vokabelId = sitzung.queue[sitzung.index];
  const vokabel = sitzung.nachId.get(vokabelId);
  if (!vokabel) return null;
  const richtung = sitzung.richtungen[vokabelId];
  return {
    vokabel,
    richtung,
    frage: richtung === 'de-en' ? vokabel.de : vokabel.en,
    loesung: richtung === 'de-en' ? vokabel.en : vokabel.de,
    frageSprache: richtung === 'de-en' ? 'de' : 'en',
    loesungSprache: richtung === 'de-en' ? 'en' : 'de'
  };
}

/**
 * Prueft die Eingabe und vermerkt das Ergebnis in der Sitzung.
 * Ruft der Aufrufer danach weiter(), geht es zur naechsten Vokabel.
 */
export function antworten(sitzung, eingabe) {
  const frage = aktuelleFrage(sitzung);
  if (!frage) return null;

  const richtig = istRichtig(eingabe, frage.loesung);
  const ergebnis = {
    richtig,
    eingabe,
    loesung: frage.loesung,
    // Zum Anzeigen die Schreibweise aus der Vokabelliste, nicht die aufgeloesten
    // Klammer-Varianten -- "(to) see" liest sich besser als "to see oder see".
    loesungen: String(frage.loesung)
      .split('/')
      .map((t) => t.trim())
      .filter(Boolean),
    // Nur fuer den Ton der Rueckmeldung -- ein Fehler bleibt es so oder so.
    fast: richtig ? null : fastRichtig(eingabe, frage.loesung),
    vokabelId: frage.vokabel.id,
    bereichId: frage.vokabel.bereichId
  };

  if (!richtig) {
    if (!sitzung.falsch.includes(frage.vokabel.id)) sitzung.falsch.push(frage.vokabel.id);
    if (sitzung.runde === 1) sitzung.fehlerRunde1.add(frage.vokabel.id);
  }

  sitzung.letzte = ergebnis;
  return ergebnis;
}

/** Geht zur naechsten Vokabel bzw. startet die naechste Wiederholungsrunde. */
export function weiter(sitzung) {
  sitzung.letzte = null;
  sitzung.index += 1;
  if (sitzung.index < sitzung.queue.length) return;

  if (sitzung.falsch.length > 0) {
    sitzung.runde += 1;
    sitzung.queue = mischen(sitzung.falsch);
    sitzung.falsch = [];
    sitzung.index = 0;
    return;
  }
  sitzung.fertig = true;
}

/** Wie weit ist die aktuelle Runde? */
export function fortschritt(sitzung) {
  return {
    runde: sitzung.runde,
    position: Math.min(sitzung.index + 1, sitzung.queue.length),
    gesamt: sitzung.queue.length
  };
}

/**
 * Auswertung am Ende. Eine beendete Sitzung heisst: jede Vokabel wurde einmal
 * richtig beantwortet -- notfalls erst in einer Wiederholungsrunde. Damit gilt
 * jeder beteiligte Bereich als fehlerfrei durchgelaufen.
 */
export function abschluss(sitzung) {
  const bereicheMitVokabeln = new Set([...sitzung.nachId.values()].map((v) => v.bereichId));

  // Bereiche, in denen schon in Durchgang 1 keine einzige Vokabel falsch war.
  const mitFehler = new Set();
  for (const vokabelId of sitzung.fehlerRunde1) {
    const vokabel = sitzung.nachId.get(vokabelId);
    if (vokabel) mitFehler.add(vokabel.bereichId);
  }

  return {
    gesamt: sitzung.gesamtRunde1,
    fehlerRunde1: [...sitzung.fehlerRunde1].map((id) => sitzung.nachId.get(id)).filter(Boolean),
    runden: sitzung.runde,
    geschaffteBereiche: [...bereicheMitVokabeln],
    perfekteBereiche: [...bereicheMitVokabeln].filter((b) => !mitFehler.has(b)),
    allesAufAnhieb: sitzung.fehlerRunde1.size === 0 && sitzung.gesamtRunde1 > 0
  };
}

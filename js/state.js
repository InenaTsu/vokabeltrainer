// Zentrales State-Objekt samt Aktionen. Kein Framework: Views abonnieren
// Aenderungen und bauen ihren Container neu auf.

import * as speicher from './storage.js';
import { dublettenSchluessel } from './check.js';

export const state = {
  bereiche: [],
  vokabeln: [],
  fortschritt: {},
  bereichStatus: {},
  settings: { apiKey: '', stimme: '', modell: 'claude-opus-5', vereinteSicherungen: [] },

  // Reine Oberflaechen-Zustaende (werden nicht gespeichert)
  ansicht: 'uebersicht', // uebersicht | abfrage | verwalten | einstellungen
  auswahl: [], // markierte Bereichs-Ids in der Uebersicht
  richtungWahl: 'de-en', // zuletzt gewaehlte Abfragerichtung
  sitzung: null, // laufende Abfrage, siehe trainer.js
  verwaltenBereich: null, // Bereich, der gerade bearbeitet wird
  meldung: null // { art: 'fehler'|'gut'|'info', text: string }
};

const hoerer = new Set();

export function subscribe(fn) {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

export function notify() {
  for (const fn of hoerer) fn(state);
}

export async function laden() {
  const daten = await speicher.allesLaden();
  Object.assign(state, daten);
  notify();
}

/** Speichert und meldet Fehler sichtbar, statt sie zu verschlucken. */
async function sichern(teil) {
  try {
    await speicher.speichern(teil);
    return true;
  } catch (fehler) {
    melden('fehler', 'Konnte nicht gespeichert werden: ' + (fehler?.message || fehler));
    return false;
  }
}

export function melden(art, text) {
  state.meldung = text ? { art, text } : null;
  notify();
}

export function meldungWeg() {
  state.meldung = null;
  notify();
}

export function zeige(ansicht) {
  state.ansicht = ansicht;
  state.meldung = null;
  notify();
}

function id() {
  return crypto.randomUUID();
}

/* ---------- Bereiche ---------- */

export async function bereichAnlegen(name, quelle = 'manuell') {
  // Gibt es den Namen schon, wird der vorhandene Bereich genommen -- sonst entstehen
  // zwei gleichnamige Bereiche und man landet beim Oeffnen im falschen.
  const vorhanden = bereichNachName(name);
  if (vorhanden) return vorhanden;

  const bereich = { id: id(), name: name.trim(), erstellt: new Date().toISOString(), quelle };
  state.bereiche.push(bereich);
  await sichern({ bereiche: state.bereiche });
  notify();
  return bereich;
}

export async function bereichUmbenennen(bereichId, name) {
  const bereich = state.bereiche.find((b) => b.id === bereichId);
  if (!bereich) return false;

  const konflikt = bereichNachName(name);
  if (konflikt && konflikt.id !== bereichId) {
    melden('fehler', `Es gibt schon einen Bereich „${konflikt.name}".`);
    return false;
  }

  bereich.name = name.trim();
  await sichern({ bereiche: state.bereiche });
  notify();
  return true;
}

/**
 * Verschiebt einen Bereich in der Uebersicht um einen Platz nach oben oder unten.
 * Die Reihenfolge ist die des Feldes `state.bereiche` -- genau die zeigt die Uebersicht.
 * Am Rand passiert nichts.
 * @param {-1|1} richtung -1 = nach oben, 1 = nach unten
 */
export async function bereichVerschieben(bereichId, richtung) {
  const von = state.bereiche.findIndex((b) => b.id === bereichId);
  const nach = von + richtung;
  if (von === -1 || nach < 0 || nach >= state.bereiche.length) return false;

  const [bereich] = state.bereiche.splice(von, 1);
  state.bereiche.splice(nach, 0, bereich);
  await sichern({ bereiche: state.bereiche });
  notify();
  return true;
}

export async function bereichLoeschen(bereichId) {
  state.bereiche = state.bereiche.filter((b) => b.id !== bereichId);
  const bleiben = state.vokabeln.filter((v) => v.bereichId !== bereichId);
  for (const v of state.vokabeln) {
    if (v.bereichId === bereichId) delete state.fortschritt[v.id];
  }
  state.vokabeln = bleiben;
  delete state.bereichStatus[bereichId];
  state.auswahl = state.auswahl.filter((x) => x !== bereichId);
  await sichern({
    bereiche: state.bereiche,
    vokabeln: state.vokabeln,
    fortschritt: state.fortschritt,
    bereichStatus: state.bereichStatus
  });
  notify();
}

/**
 * Gruppen von Bereichen, die denselben Namen tragen (ohne Gross-/Kleinschreibung und
 * Randleerzeichen). Neue koennen nicht mehr entstehen -- vor dem Fix angelegte schon.
 * Liefert nur Gruppen mit mehr als einem Bereich.
 */
export function doppelteBereiche() {
  const nachName = new Map();
  for (const b of state.bereiche) {
    const schluessel = String(b.name ?? '').trim().toLowerCase();
    if (!nachName.has(schluessel)) nachName.set(schluessel, []);
    nachName.get(schluessel).push(b);
  }
  return [...nachName.values()].filter((gruppe) => gruppe.length > 1);
}

/** Zaehlt den Fortschritt einer wegfallenden Vokabel auf die bleibende drauf. */
/** Rechnet einen fremden Fortschritt auf eine Vokabel drauf. Treffer und Fehler addieren. */
function fortschrittDazu(zielId, fremd) {
  if (!fremd) return;
  const da = state.fortschritt[zielId] || { richtig: 0, falsch: 0, letzteAbfrage: null };
  state.fortschritt[zielId] = {
    richtig: (da.richtig || 0) + (fremd.richtig || 0),
    falsch: (da.falsch || 0) + (fremd.falsch || 0),
    letzteAbfrage: [da.letzteAbfrage, fremd.letzteAbfrage].filter(Boolean).sort().pop() || null
  };
}

function fortschrittZusammenlegen(vonId, nachId) {
  if (!state.fortschritt[vonId]) return;
  fortschrittDazu(nachId, state.fortschritt[vonId]);
  delete state.fortschritt[vonId];
}

/**
 * Legt den Bienen-Stand eines wegfallenden Bereichs auf den bleibenden.
 * Die Zaehler werden NICHT addiert: jeder Durchlauf galt nur der Haelfte der Vokabeln,
 * zusammengezaehlt waeren es erfundene Erfolge. Es gilt der bessere der beiden Staende.
 */
function statusDazu(zielId, fremd) {
  if (!fremd) return;
  const da = state.bereichStatus[zielId] || {};
  const daten = [da.geschafftAm, fremd.geschafftAm].filter(Boolean).sort();
  const letzte = [da.letzterErfolg, fremd.letzterErfolg].filter(Boolean).sort();
  state.bereichStatus[zielId] = {
    geschafft: Boolean(da.geschafft || fremd.geschafft),
    geschafftAm: daten[0] || null,
    erfolge: Math.max(da.erfolge ?? (da.geschafft ? 1 : 0), fremd.erfolge ?? (fremd.geschafft ? 1 : 0)),
    perfekt: Math.max(da.perfekt ?? 0, fremd.perfekt ?? 0),
    letzterErfolg: letzte[letzte.length - 1] || null
  };
}

function statusZusammenlegen(hauptId, altId) {
  statusDazu(hauptId, state.bereichStatus[altId]);
}

/**
 * Fuehrt alle gleichnamigen Bereiche zusammen. Der zuerst angelegte bleibt, die Vokabeln
 * der anderen ziehen um und haengen hinten an. Vokabeln, die es im bleibenden Bereich
 * schon gibt (Vergleich wie beim Import ueber dublettenSchluessel), fallen weg -- ihr
 * Fortschritt wird auf den bleibenden Eintrag addiert.
 */
export async function bereicheZusammenfuehren() {
  const gruppen = doppelteBereiche();
  if (gruppen.length === 0) return { gruppen: 0, entfernt: 0, verschoben: 0, doppelt: 0 };

  const wegVokabeln = new Set();
  const wegBereiche = new Set();
  let verschoben = 0;

  for (const gruppe of gruppen) {
    const [haupt, ...weitere] = [...gruppe].sort((a, b) =>
      String(a.erstellt ?? '').localeCompare(String(b.erstellt ?? ''))
    );

    const bekannt = new Map();
    for (const v of vokabelnVonBereich(haupt.id)) {
      const schluessel = dublettenSchluessel(v.en);
      if (!bekannt.has(schluessel)) bekannt.set(schluessel, v);
    }

    for (const alt of weitere) {
      for (const v of vokabelnVonBereich(alt.id)) {
        const schluessel = dublettenSchluessel(v.en);
        const vorhanden = bekannt.get(schluessel);
        if (vorhanden) {
          fortschrittZusammenlegen(v.id, vorhanden.id);
          wegVokabeln.add(v.id);
        } else {
          v.bereichId = haupt.id;
          bekannt.set(schluessel, v);
          verschoben += 1;
        }
      }
      statusZusammenlegen(haupt.id, alt.id);
      wegBereiche.add(alt.id);
    }
  }

  state.vokabeln = state.vokabeln.filter((v) => !wegVokabeln.has(v.id));
  state.bereiche = state.bereiche.filter((b) => !wegBereiche.has(b.id));
  state.auswahl = state.auswahl.filter((x) => !wegBereiche.has(x));
  for (const id of wegBereiche) delete state.bereichStatus[id];

  await sichern({
    bereiche: state.bereiche,
    vokabeln: state.vokabeln,
    fortschritt: state.fortschritt,
    bereichStatus: state.bereichStatus
  });
  notify();
  return { gruppen: gruppen.length, entfernt: wegBereiche.size, verschoben, doppelt: wegVokabeln.size };
}

/**
 * Spielt eine Sicherungsdatei ein, OHNE den Bestand des Geraets zu loeschen.
 * Gegenstueck zu importieren() in js/storage.js, das alles ersetzt.
 * Regeln siehe Abschnitt 8 der Spezifikation:
 *
 * - Bereiche werden ueber den Namen zugeordnet (ohne Gross-/Kleinschreibung und
 *   Randleerzeichen, wie bereichNachName). Unbekannte haengen hinten an.
 * - Vokabeln ueber dublettenSchluessel() der englischen Seite, wie beim Import. Es gilt
 *   der Eintrag, der schon auf dem Geraet liegt -- dessen Schreibweise bleibt.
 * - Fortschritt: richtig und falsch werden addiert.
 * - erfolge und perfekt: das Maximum, NICHT die Summe. Gleiche Begruendung wie bei
 *   statusDazu -- jeder Durchlauf galt nur einem Teil der Vokabeln, eine Summe waeren
 *   erfundene Erfolge. Die Sterne auf dem Geraet koennen dadurch nie weniger werden.
 * - Der API-Schluessel wird nie uebernommen; die Sicherung enthaelt bewusst keinen.
 *
 * Dieselbe Datei ein zweites Mal hinzuzufuegen wird abgelehnt. Vokabeln wuerden zwar nicht
 * doppelt entstehen, aber Treffer und Fehler ein zweites Mal addiert -- die Fehlerzahl auf
 * der Bereichskarte waere dann erfunden. Gemerkt wird der Zeitstempel `exportiert` aus der
 * Datei (siehe exportieren() in js/storage.js).
 */
export async function sicherungZusammenfuehren(jsonText) {
  const fremd = JSON.parse(jsonText);
  const fremdBereiche = Array.isArray(fremd?.bereiche) ? fremd.bereiche : [];
  const fremdVokabeln = Array.isArray(fremd?.vokabeln) ? fremd.vokabeln : [];
  const fremdFortschritt = fremd?.fortschritt || {};
  const fremdStatus = fremd?.bereichStatus || {};

  if (fremdBereiche.length === 0 && fremdVokabeln.length === 0) {
    throw new Error('In dieser Datei stehen keine Vokabeln.');
  }

  const stempel = String(fremd?.exportiert ?? '');
  const schonVereint = state.settings.vereinteSicherungen || [];
  if (stempel && schonVereint.includes(stempel)) {
    // Kein Fehler, sondern ein harmloser Hinweis - die Ansicht zeigt ihn ohne rote Schrift.
    const hinweis = new Error('Diese Sicherung wurde hier schon hinzugefügt - es ändert sich nichts.');
    hinweis.sanft = true;
    throw hinweis;
  }

  const bilanz = { neueBereiche: 0, neueVokabeln: 0, schonDa: 0 };
  const zuordnung = new Map(); // Bereichs-Id aus der Datei -> Id auf diesem Geraet

  for (const fb of fremdBereiche) {
    const name = String(fb?.name ?? '').trim();
    if (!name || fb?.id === undefined) continue;
    const vorhanden = bereichNachName(name);
    if (vorhanden) {
      zuordnung.set(fb.id, vorhanden.id);
      continue;
    }
    const neu = {
      id: id(),
      name,
      erstellt: fb.erstellt || new Date().toISOString(),
      quelle: fb.quelle || 'manuell'
    };
    state.bereiche.push(neu);
    zuordnung.set(fb.id, neu.id);
    bilanz.neueBereiche += 1;
  }

  // Je Zielbereich einmal nachsehen, was dort schon liegt.
  const bekannt = new Map();
  const bekannteVon = (bereichId) => {
    if (!bekannt.has(bereichId)) {
      const karte = new Map();
      for (const v of vokabelnVonBereich(bereichId)) {
        const schluessel = dublettenSchluessel(v.en);
        if (!karte.has(schluessel)) karte.set(schluessel, v);
      }
      bekannt.set(bereichId, karte);
    }
    return bekannt.get(bereichId);
  };

  for (const fv of fremdVokabeln) {
    const zielBereich = zuordnung.get(fv?.bereichId);
    if (!zielBereich) continue; // Vokabel ohne Bereich in der Datei
    const de = String(fv?.de ?? '').trim();
    const en = String(fv?.en ?? '').trim();
    if (!de || !en) continue;

    const karte = bekannteVon(zielBereich);
    const schluessel = dublettenSchluessel(en);
    const vorhanden = karte.get(schluessel);

    if (vorhanden) {
      fortschrittDazu(vorhanden.id, fremdFortschritt[fv.id]);
      bilanz.schonDa += 1;
    } else {
      const neu = {
        id: id(),
        bereichId: zielBereich,
        de,
        en,
        typ: fv?.typ === 'satz' ? 'satz' : 'wort',
        hinweis: fv?.hinweis ?? null
      };
      state.vokabeln.push(neu);
      karte.set(schluessel, neu);
      fortschrittDazu(neu.id, fremdFortschritt[fv.id]);
      bilanz.neueVokabeln += 1;
    }
  }

  for (const [fremdId, zielId] of zuordnung) statusDazu(zielId, fremdStatus[fremdId]);

  // Nur die letzten 20 merken - die Liste soll nicht unbegrenzt wachsen.
  if (stempel) state.settings.vereinteSicherungen = [...schonVereint, stempel].slice(-20);

  await sichern({
    bereiche: state.bereiche,
    vokabeln: state.vokabeln,
    fortschritt: state.fortschritt,
    bereichStatus: state.bereichStatus,
    settings: state.settings
  });
  notify();
  return bilanz;
}

/* ---------- Vokabeln ---------- */

export function neueVokabel(bereichId, de, en, typ = 'wort', hinweis = null) {
  return { id: id(), bereichId, de: de.trim(), en: en.trim(), typ, hinweis };
}

export async function vokabelnHinzufuegen(bereichId, paare) {
  const neue = paare
    .filter((p) => p.de?.trim() && p.en?.trim())
    .map((p) => neueVokabel(bereichId, p.de, p.en, p.typ || typErkennen(p.de, p.en), p.hinweis ?? null));
  state.vokabeln.push(...neue);
  await sichern({ vokabeln: state.vokabeln });
  notify();
  return neue;
}

export async function vokabelAendern(vokabelId, felder) {
  const vokabel = state.vokabeln.find((v) => v.id === vokabelId);
  if (!vokabel) return;
  Object.assign(vokabel, felder);
  if (felder.de || felder.en) vokabel.typ = typErkennen(vokabel.de, vokabel.en);
  // Bewusst ohne notify(): das Feld zeigt den neuen Wert bereits, und ein
  // Neuaufbau waehrend des Tippens wuerde den Fokus wegnehmen.
  await sichern({ vokabeln: state.vokabeln });
}

export async function vokabelLoeschen(vokabelId) {
  state.vokabeln = state.vokabeln.filter((v) => v.id !== vokabelId);
  delete state.fortschritt[vokabelId];
  await sichern({ vokabeln: state.vokabeln, fortschritt: state.fortschritt });
  notify();
}

function typErkennen(de, en) {
  const woerter = (t) => String(t).trim().split(/\s+/).length;
  const satzzeichen = (t) => /[.!?]\s*$/.test(String(t).trim());
  // Ab drei Woertern oder mit Satzzeichen am Ende gilt es als Satz. Fuer die Pruefung
  // spielt das seit dem 12.09.2026 keine Rolle mehr (check.js vergleicht immer streng),
  // der Typ steuert nur noch die Darstellung der Frage.
  return woerter(de) > 2 || woerter(en) > 2 || satzzeichen(de) || satzzeichen(en)
    ? 'satz'
    : 'wort';
}

/* ---------- Fortschritt ---------- */

export function fortschrittBuchen(vokabelId, richtig) {
  const eintrag = state.fortschritt[vokabelId] || { richtig: 0, falsch: 0, letzteAbfrage: null };
  if (richtig) eintrag.richtig += 1;
  else eintrag.falsch += 1;
  eintrag.letzteAbfrage = new Date().toISOString();
  state.fortschritt[vokabelId] = eintrag;
}

/**
 * Bucht einen fehlerfreien Durchlauf: Der Bereich wurde komplett richtig geuebt
 * (Wiederholungen eingeschlossen). Der erste Durchlauf laesst die Biene laecheln,
 * jeder weitere bringt einen Stern -- siehe belohnung() in bee.js.
 * Einmal geschafft bleibt geschafft, die Zahl wird nie zurueckgesetzt.
 */
export function erfolgBuchen(bereichId, aufAnhieb = false) {
  const bisher = state.bereichStatus[bereichId] || {};
  const erfolge = (bisher.erfolge ?? (bisher.geschafft ? 1 : 0)) + 1;
  const perfekt = (bisher.perfekt ?? 0) + (aufAnhieb ? 1 : 0);
  state.bereichStatus[bereichId] = {
    ...bisher,
    geschafft: true,
    geschafftAm: bisher.geschafftAm || new Date().toISOString(),
    erfolge,
    perfekt,
    letzterErfolg: new Date().toISOString()
  };
  return { erfolge, perfekt };
}

/** Zahl der abgeschlossenen Durchlaeufe (alte Staende zaehlen als einer). */
export function erfolgeVon(bereichId) {
  const status = state.bereichStatus[bereichId];
  if (!status) return 0;
  return status.erfolge ?? (status.geschafft ? 1 : 0);
}

/** Zahl der Durchlaeufe ganz ohne Fehler -- die Grundlage fuer Bienenfarbe und Sterne. */
export function perfekteVon(bereichId) {
  return state.bereichStatus[bereichId]?.perfekt ?? 0;
}

export async function fortschrittSichern() {
  await sichern({ fortschritt: state.fortschritt, bereichStatus: state.bereichStatus });
}

/**
 * Setzt alle Uebungsergebnisse zurueck: Fehlerzaehler, Durchlaeufe, Bienen und Sterne.
 * Die Vokabeln und Bereiche selbst bleiben unangetastet.
 */
export async function uebungenZuruecksetzen() {
  state.fortschritt = {};
  state.bereichStatus = {};
  await sichern({ fortschritt: state.fortschritt, bereichStatus: state.bereichStatus });
  notify();
}

/** Dasselbe fuer einen einzelnen Bereich. */
export async function bereichZuruecksetzen(bereichId) {
  for (const v of vokabelnVonBereich(bereichId)) delete state.fortschritt[v.id];
  delete state.bereichStatus[bereichId];
  await sichern({ fortschritt: state.fortschritt, bereichStatus: state.bereichStatus });
  notify();
}

/* ---------- Einstellungen ---------- */

export async function settingsSetzen(felder) {
  Object.assign(state.settings, felder);
  await sichern({ settings: state.settings });
  notify();
}

/* ---------- Abfragen auf dem Bestand ---------- */

export function vokabelnVonBereich(bereichId) {
  return state.vokabeln.filter((v) => v.bereichId === bereichId);
}

export function vokabelnVonBereichen(bereichIds) {
  const menge = new Set(bereichIds);
  return state.vokabeln.filter((v) => menge.has(v.bereichId));
}

export function bereichName(bereichId) {
  return state.bereiche.find((b) => b.id === bereichId)?.name || 'Unbekannt';
}

/**
 * Sucht einen Bereich nach Namen (ohne Gross-/Kleinschreibung und Randleerzeichen).
 * Verhindert, dass zwei Bereiche mit demselben Namen entstehen.
 */
export function bereichNachName(name) {
  const gesucht = String(name ?? '').trim().toLowerCase();
  if (!gesucht) return null;
  return state.bereiche.find((b) => b.name.trim().toLowerCase() === gesucht) || null;
}

/**
 * Kennzahlen eines Bereichs fuer die Uebersicht.
 * quote = Anteil richtiger Antworten an allen Antworten in diesem Bereich.
 */
export function bereichStatistik(bereichId) {
  const vokabeln = vokabelnVonBereich(bereichId);
  let richtig = 0;
  let falsch = 0;
  let geuebt = 0;
  let sitzen = 0; // Vokabeln, die mindestens einmal richtig waren
  for (const v of vokabeln) {
    const f = state.fortschritt[v.id];
    if (!f) continue;
    richtig += f.richtig;
    falsch += f.falsch;
    if (f.richtig + f.falsch > 0) geuebt += 1;
    if (f.richtig > 0) sitzen += 1;
  }
  const antworten = richtig + falsch;
  return {
    anzahl: vokabeln.length,
    geuebt,
    sitzen,
    richtig,
    falsch,
    antworten,
    // Der Balken zeigt, wie viele Vokabeln schon einmal richtig waren -- nicht die
    // Trefferquote aller Antworten. Wer den Bereich einmal durchgespielt hat, steht
    // deshalb auf 100 %, auch wenn es erst in der Wiederholung geklappt hat.
    quote: vokabeln.length === 0 || antworten === 0 ? null : sitzen / vokabeln.length,
    geschafft: erfolgeVon(bereichId) > 0,
    erfolge: erfolgeVon(bereichId),
    perfekt: perfekteVon(bereichId)
  };
}

/** Die Vokabeln mit den meisten Fehlern, ueber alle Bereiche hinweg. */
export function schwersteWoerter(anzahl = 10) {
  return state.vokabeln
    .map((v) => ({ vokabel: v, ...(state.fortschritt[v.id] || { richtig: 0, falsch: 0 }) }))
    .filter((e) => e.falsch > 0)
    .sort((a, b) => b.falsch - a.falsch || a.richtig - b.richtig)
    .slice(0, anzahl);
}

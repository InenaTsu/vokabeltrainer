// Einzige Stelle mit Persistenz. Heute IndexedDB (nur dieses Geraet).
// Ausbaustufe 2 (zentrale Ablage im Netz + Offline-Kopie) soll allein durch
// Austausch dieser Datei moeglich sein -- deshalb greift sonst niemand direkt
// auf IndexedDB zu.

const DB_NAME = 'vokabeltrainer';
const DB_VERSION = 1;
const STORE = 'daten';

let dbPromise = null;

function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((auf, ab) => {
    const anfrage = indexedDB.open(DB_NAME, DB_VERSION);
    anfrage.onupgradeneeded = () => {
      const datenbank = anfrage.result;
      if (!datenbank.objectStoreNames.contains(STORE)) {
        datenbank.createObjectStore(STORE);
      }
    };
    anfrage.onsuccess = () => auf(anfrage.result);
    anfrage.onerror = () => ab(anfrage.error);
  });
  return dbPromise;
}

function lesen(schluessel) {
  return db().then(
    (datenbank) =>
      new Promise((auf, ab) => {
        const t = datenbank.transaction(STORE, 'readonly');
        const anfrage = t.objectStore(STORE).get(schluessel);
        anfrage.onsuccess = () => auf(anfrage.result);
        anfrage.onerror = () => ab(anfrage.error);
      })
  );
}

function schreiben(schluessel, wert) {
  return db().then(
    (datenbank) =>
      new Promise((auf, ab) => {
        const t = datenbank.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(wert, schluessel);
        t.oncomplete = () => auf();
        t.onerror = () => ab(t.error);
        t.onabort = () => ab(t.error);
      })
  );
}

const LEER = {
  bereiche: [],
  vokabeln: [],
  fortschritt: {},
  bereichStatus: {},
  settings: { apiKey: '', stimme: '', modell: 'claude-opus-5' }
};

/** Laedt den gesamten Bestand. Bei Problemen wird ein leerer Bestand geliefert. */
export async function allesLaden() {
  const daten = {};
  for (const schluessel of Object.keys(LEER)) {
    const wert = await lesen(schluessel);
    daten[schluessel] = wert === undefined ? strukturKopie(LEER[schluessel]) : wert;
  }
  daten.settings = { ...LEER.settings, ...daten.settings };
  return daten;
}

/** Speichert einzelne Teilbereiche. Wirft bei Fehlern -- Aufrufer meldet das sichtbar. */
export async function speichern(teil) {
  for (const [schluessel, wert] of Object.entries(teil)) {
    if (!(schluessel in LEER)) continue;
    await schreiben(schluessel, wert);
  }
}

/** Kompletter Export als JSON-Text (Sicherung / spaeterer Umzug ins Netz). */
export async function exportieren() {
  const daten = await allesLaden();
  delete daten.settings.apiKey;
  return JSON.stringify({ version: 1, exportiert: new Date().toISOString(), ...daten }, null, 2);
}

/** Import einer Exportdatei. Ersetzt den vorhandenen Bestand. */
export async function importieren(jsonText) {
  const daten = JSON.parse(jsonText);
  const teil = {};
  for (const schluessel of ['bereiche', 'vokabeln', 'fortschritt', 'bereichStatus']) {
    if (daten[schluessel] !== undefined) teil[schluessel] = daten[schluessel];
  }
  await speichern(teil);
  return teil;
}

function strukturKopie(wert) {
  return JSON.parse(JSON.stringify(wert));
}

// Vokabeln aus Foto oder PDF lesen (Claude Messages API).
//
// Kein Bundler im Projekt, deshalb direkter fetch statt SDK. Der Aufruf laeuft
// aus dem Browser, dafuer ist der Header anthropic-dangerous-direct-browser-access
// noetig. Der Schluessel steht in den Einstellungen, nie im Code.

const ENDPUNKT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_BILDKANTE = 1568; // groesser bringt keine bessere Erkennung
const MAX_PDF_BYTES = 30 * 1024 * 1024;

const FORMAT = `Antworte ausschliesslich mit JSON in genau dieser Form, ohne Text davor oder danach:
{"bereich": "...", "vokabeln": [{"de": "...", "en": "...", "typ": "wort", "korrektur": null}]}

"korrektur" ist null, wenn nichts zu beanstanden war, sonst ein kurzer deutscher Satz,
was du geaendert hast (z. B. "Englisch war \\"tuesdy\\" - korrigiert zu \\"Tuesday\\".").`;

const GEMEINSAM = `Regeln:
- "de" ist das deutsche Wort bzw. der deutsche Satz, "en" das englische.
- ARTIKEL: Die ENGLISCHE Seite bestimmt, ob ueberhaupt ein Artikel dabei ist.
  1. Englisch wird woertlich uebernommen: steht dort "beach", bleibt es "beach"; steht dort
     "the beach", bleibt es "the beach". Niemals "the"/"a"/"an" ergaenzen oder streichen.
  2. Die deutsche Seite richtet sich danach. Steht auf der englischen Seite KEIN Artikel,
     steht auch auf der deutschen keiner - "der"/"die"/"das" wird gestrichen, auch wenn es
     in der Vorlage steht: "textbook" + "das Textbuch" wird zu "textbook" + "Textbuch".
     Steht auf der englischen Seite ein Artikel, behaelt die deutsche Seite ihren bzw.
     bekommt den passenden: "the dog" + "Hund" wird zu "the dog" + "der Hund".
  3. Artikel setzen oder streichen ist KEINE Korrektur und wird NICHT in "korrektur" gemeldet.
- Mehrere gueltige Loesungen mit " / " trennen: "the bike / the bicycle".
- "typ" ist "satz", wenn es ein ganzer Satz ist, sonst "wort".
- Rechtschreibung pruefen und echte Schreibfehler korrigieren ("tuesdy" -> "Tuesday").
  Wenn die deutsche und die englische Seite nicht zusammenpassen, gilt IMMER das Englische -
  die deutsche Seite wird daran angepasst, egal auf welcher Seite sie steht.
  Jede Aenderung in "korrektur" begruenden. Ein fehlender oder vorhandener Artikel ist
  KEIN Schreibfehler (siehe naechste Regel).
- Nicht raten. Was du nicht sicher lesen oder zuordnen kannst, laesst du weg und traegst
  es stattdessen in "unklar" ein.`;

const ANWEISUNG = `Du liest eine Vokabelseite aus einem Englisch-Schulbuch der 5. Klasse
(Foto, Bildschirmausschnitt oder PDF). Die Vorlage kann abgeschrieben und fehlerhaft sein.

Aufgabe: Finde alle Vokabeln und gib sie als JSON zurueck.

${GEMEINSAM}
- REIHENFOLGE genau wie in der Vorlage: von oben nach unten durchgehen. Stehen die Vokabeln
  in zwei Spalten untereinander (linke Spalte Deutsch, rechte Englisch), ist das EINE Liste -
  Zeile fuer Zeile von oben nach unten. Bei mehreren Bildern in der Reihenfolge der Bilder.
  Nicht alphabetisch sortieren, nicht umstellen, nichts nach vorne ziehen.
- Steht nur EINE Sprache in der Vorlage (z. B. nur die englischen Woerter), ergaenze die
  andere Seite selbst mit der im Schulunterricht ueblichen Uebersetzung.
- Lautschrift, Seitenzahlen, Ueberschriften und Uebungsaufgaben NICHT als Vokabel aufnehmen.
- "bereich" ist ein kurzer deutscher Name fuer das Thema (z. B. "Farben", "Wochentage",
  "Unit 3 - At school"). Wenn nichts erkennbar ist: "Neue Vokabeln".
- "unklar" ist eine Liste kurzer deutscher Fragen zu allem, was du nicht sicher lesen
  konntest (z. B. "Zeile 4: Handschrift nicht lesbar - heisst es \\"bread\\" oder \\"beard\\"?").
  Nichts unklar? Dann eine leere Liste.

${FORMAT}`;

const ANWEISUNG_TEXT = `Du stellst eine Vokabelliste fuer eine 10-jaehrige Schuelerin
(Englisch, 5. Klasse) zusammen. Der Wunsch steht unten.

Aufgabe: Erzeuge die passenden Vokabeln als JSON.

${GEMEINSAM}
- Nimm genau das, was gewuenscht ist - vollstaendig, aber ohne Zugaben.
- Reihenfolge in der natuerlichen Ordnung: Wochentage ab Montag, Monate ab Januar,
  Zahlen aufsteigend. Gibt es keine, dann so, wie im Wunsch aufgezaehlt.
- "bereich" ist ein kurzer deutscher Name fuer das Thema des Wunsches.
- "unklar" ist eine Liste kurzer deutscher Rueckfragen, falls der Wunsch mehrdeutig ist.
  Sonst eine leere Liste.

${FORMAT}`;

function base64VonBlob(blob) {
  return new Promise((auf, ab) => {
    const leser = new FileReader();
    leser.onload = () => auf(String(leser.result).split(',')[1]);
    leser.onerror = () => ab(leser.error);
    leser.readAsDataURL(blob);
  });
}

/** Verkleinert grosse Fotos im Browser, damit der Upload klein bleibt. */
async function bildBlock(datei) {
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, MAX_BILDKANTE / Math.max(bild.width, bild.height));

  if (faktor === 1 && datei.size < 4 * 1024 * 1024) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: datei.type || 'image/jpeg', data: await base64VonBlob(datei) }
    };
  }

  const leinwand = document.createElement('canvas');
  leinwand.width = Math.round(bild.width * faktor);
  leinwand.height = Math.round(bild.height * faktor);
  leinwand.getContext('2d').drawImage(bild, 0, 0, leinwand.width, leinwand.height);

  const blob = await new Promise((auf) => leinwand.toBlob(auf, 'image/jpeg', 0.85));
  return {
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: await base64VonBlob(blob) }
  };
}

async function pdfBlock(datei) {
  if (datei.size > MAX_PDF_BYTES) {
    throw new Error('Das PDF ist zu groß (mehr als 30 MB). Bitte nur die nötigen Seiten schicken.');
  }
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: await base64VonBlob(datei) }
  };
}

async function dateiBlock(datei) {
  if (datei.type === 'application/pdf') return pdfBlock(datei);
  if (datei.type.startsWith('image/')) return bildBlock(datei);
  throw new Error('Nur Bilder und PDF-Dateien können gelesen werden.');
}

function jsonAusAntwort(text) {
  const roh = String(text).trim();
  const start = roh.indexOf('{');
  const ende = roh.lastIndexOf('}');
  if (start === -1 || ende === -1) throw new Error('Keine Vokabeln in der Antwort gefunden.');
  return JSON.parse(roh.slice(start, ende + 1));
}

async function anfrage(inhalt, apiKey, modell) {
  let antwort;
  try {
    antwort = await fetch(ENDPUNKT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: modell || 'claude-opus-5',
        max_tokens: 16000,
        messages: [{ role: 'user', content: inhalt }]
      })
    });
  } catch {
    throw new Error('Kein Netz erreichbar. Der Import braucht Internet - Abfragen geht weiter.');
  }

  if (!antwort.ok) {
    const text = await antwort.text();
    if (antwort.status === 401) throw new Error('Der API-Schlüssel wird nicht akzeptiert. Bitte in den Einstellungen prüfen.');
    if (antwort.status === 429) throw new Error('Zu viele Anfragen auf einmal. Bitte kurz warten und noch einmal versuchen.');
    throw new Error(`Claude antwortet mit Fehler ${antwort.status}: ${text.slice(0, 300)}`);
  }

  const daten = await antwort.json();
  if (daten.stop_reason === 'refusal') {
    throw new Error('Claude hat die Auswertung dieses Bildes abgelehnt.');
  }
  return (daten.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/** Schickt die Anfrage ab und wiederholt sie einmal, falls kein gueltiges JSON kam. */
async function mitRetry(inhalt, apiKey, modell) {
  let roh = await anfrage(inhalt, apiKey, modell);
  try {
    return { ...pruefen(jsonAusAntwort(roh)), roh };
  } catch {
    // Einmaliger Retry, danach Fehler mit einsehbarer Rohantwort (Spezifikation 6).
    roh = await anfrage(
      [...inhalt, { type: 'text', text: 'Die letzte Antwort war kein gueltiges JSON. Antworte jetzt NUR mit dem JSON-Objekt.' }],
      apiKey,
      modell
    );
    try {
      return { ...pruefen(jsonAusAntwort(roh)), roh };
    } catch (fehler) {
      const raus = new Error('Claude hat keine lesbare Vokabelliste geliefert.');
      raus.roh = roh;
      throw raus;
    }
  }
}

function mitBereich(anweisung, bereichHinweis) {
  return bereichHinweis ? `${anweisung}\n\nHinweis: Der Bereich heisst "${bereichHinweis}".` : anweisung;
}

/**
 * Liest Vokabeln aus Bildern oder PDFs (Foto, Bildschirmausschnitt, Zwischenablage).
 * @returns {{bereich, vokabeln: Array<{de,en,typ,korrektur}>, unklar: string[], roh: string}}
 */
export async function vokabelnAusDateien(dateien, { apiKey, modell, bereichHinweis } = {}) {
  if (!apiKey) throw new Error('Es ist kein API-Schlüssel hinterlegt. Bitte in den Einstellungen eintragen.');
  if (!dateien || dateien.length === 0) throw new Error('Kein Bild ausgewählt.');

  const inhalt = [];
  for (const datei of dateien) inhalt.push(await dateiBlock(datei));
  inhalt.push({ type: 'text', text: mitBereich(ANWEISUNG, bereichHinweis) });

  return mitRetry(inhalt, apiKey, modell);
}

/**
 * Erzeugt Vokabeln aus einem Wunsch in Worten ("alle 7 Wochentage").
 * @returns {{bereich, vokabeln: Array<{de,en,typ,korrektur}>, unklar: string[], roh: string}}
 */
export async function vokabelnAusBeschreibung(wunsch, { apiKey, modell, bereichHinweis } = {}) {
  if (!apiKey) throw new Error('Es ist kein API-Schlüssel hinterlegt. Bitte in den Einstellungen eintragen.');
  if (!wunsch || !wunsch.trim()) throw new Error('Bitte zuerst aufschreiben, welche Vokabeln du brauchst.');

  const inhalt = [
    { type: 'text', text: `${mitBereich(ANWEISUNG_TEXT, bereichHinweis)}\n\nWunsch:\n${wunsch.trim()}` }
  ];
  return mitRetry(inhalt, apiKey, modell);
}

function pruefen(daten) {
  const vokabeln = Array.isArray(daten?.vokabeln) ? daten.vokabeln : [];
  const sauber = vokabeln
    .map((v) => ({
      de: String(v?.de ?? '').trim(),
      en: String(v?.en ?? '').trim(),
      typ: v?.typ === 'satz' ? 'satz' : 'wort',
      korrektur: v?.korrektur ? String(v.korrektur).trim() : null
    }))
    .filter((v) => v.de && v.en);

  const unklar = (Array.isArray(daten?.unklar) ? daten.unklar : [])
    .map((f) => String(f).trim())
    .filter(Boolean);

  if (sauber.length === 0 && unklar.length === 0) throw new Error('Keine Vokabeln erkannt.');
  return { bereich: String(daten?.bereich || 'Neue Vokabeln').trim(), vokabeln: sauber, unklar };
}

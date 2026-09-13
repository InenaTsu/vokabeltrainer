// Einzige Stelle, an der Antworten verglichen werden (Abschnitt 3 der Spezifikation).
//
// Regel seit 12.09.2026: Es wird Zeichen fuer Zeichen verglichen. Punkt, Komma,
// Leerzeichen und Gross-/Kleinschreibung muessen stimmen -- auch bei Saetzen, auch
// am Satzanfang. Nachgesehen wird einzig am Rand: Leerzeichen ganz vorne und ganz
// hinten sind unsichtbar und zaehlen nicht.
//
// Vorher waren Satzzeichen und doppelte Leerzeichen nie ein Fehler und bei Saetzen
// der erste Buchstabe frei. Das ist bewusst abgeschafft: in der Schulprobe zaehlt
// beides.

const SATZZEICHEN = /[.,!?;:"'`´’‘“”„«»()\[\]{}…]/g;
const BINDESTRICHE = /[-–—_]/g;

/**
 * Text ohne Satzzeichen und ohne doppelte Leerzeichen.
 *
 * NICHT Teil der Pruefregel -- nur fuer zwei Nebensachen: die freundliche
 * Rueckmeldung ("fast richtig") und den Dublettenschluessel beim Import.
 */
function ohneZeichen(text) {
  return String(text ?? '')
    .replace(SATZZEICHEN, '')
    .replace(BINDESTRICHE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Klammern machen einen Teil optional: "(to) see" gilt sowohl als "to see" als auch
 * als "see". Mehrere Klammern werden einzeln aufgeloest.
 */
function klammerVarianten(text, tiefe = 0) {
  const treffer = /\(([^()]*)\)/.exec(text);
  if (!treffer || tiefe > 4) return [text];

  const vorne = text.slice(0, treffer.index);
  const hinten = text.slice(treffer.index + treffer[0].length);
  return [
    ...klammerVarianten(vorne + treffer[1] + hinten, tiefe + 1),
    ...klammerVarianten(vorne + hinten, tiefe + 1)
  ];
}

/**
 * Zerlegt ein Loesungsfeld in alle zulaessigen Varianten:
 * "/" trennt Alternativen ("the bike / the bicycle"),
 * Klammern machen einen Teil optional ("(to) see").
 *
 * Die Leerzeichen werden hier zusammengezogen, weil das Wegfallen einer Klammer
 * eine Luecke hinterlaesst ("go (home) now" -> "go  now"). Das ist Aufraeumen an
 * der Loesung, keine Nachsicht bei der Eingabe.
 */
export function varianten(loesung) {
  return [
    ...new Set(
      String(loesung ?? '')
        .split('/')
        .flatMap((teil) => klammerVarianten(teil))
        .map((t) => t.replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 0)
    )
  ];
}

/** true, wenn die Eingabe Zeichen fuer Zeichen einer der zulaessigen Varianten entspricht. */
export function istRichtig(eingabe, loesung) {
  const gegeben = String(eingabe ?? '').trim();
  if (gegeben === '') return false;
  return varianten(loesung).includes(gegeben);
}

// Je kleiner die Zahl, desto knapper war es -- bei mehreren Varianten gilt die beste.
const RANG = { zeichen: 1, grossklein: 2, beides: 3 };

/**
 * Nur fuer die Rueckmeldung: War die Antwort inhaltlich richtig und hakt es bloss an
 * der Schreibweise? Zaehlt trotzdem als voller Fehler, wird der Lernenden aber
 * freundlicher erklaert.
 *
 * @returns {'zeichen'|'grossklein'|'beides'|null}
 *   zeichen    = nur Satzzeichen oder Leerzeichen daneben
 *   grossklein = nur gross/klein daneben
 *   beides     = beides daneben
 *   null       = etwas anderes geschrieben
 */
export function fastRichtig(eingabe, loesung) {
  const gegeben = String(eingabe ?? '').trim();
  if (gegeben === '' || istRichtig(gegeben, loesung)) return null;

  const ohne = ohneZeichen(gegeben);
  const klein = ohne.toLowerCase();

  let beste = null;
  for (const v of varianten(loesung)) {
    let art = null;
    if (ohne === ohneZeichen(v)) art = 'zeichen';
    else if (gegeben.toLowerCase() === v.toLowerCase()) art = 'grossklein';
    else if (klein === ohneZeichen(v).toLowerCase()) art = 'beides';
    if (art && (beste === null || RANG[art] < RANG[beste])) beste = art;
  }
  return beste;
}

// Artikel am Wortanfang -- NUR fuer die Dublettenerkennung beim Import.
const ARTIKEL_VORN = /^(the|an|a|der|die|das|den|dem|des)\s+/i;

/**
 * Schluessel zum Erkennen gleicher Vokabeln beim Import: ohne Gross-/Kleinschreibung
 * und ohne fuehrenden Artikel, damit "a girl" und "girl" als dieselbe Vokabel gelten.
 *
 * NICHT fuer die Antwortpruefung verwenden -- beim Abfragen zaehlt jedes Zeichen.
 */
export function dublettenSchluessel(text) {
  return ohneZeichen(text).toLowerCase().replace(ARTIKEL_VORN, '').trim();
}

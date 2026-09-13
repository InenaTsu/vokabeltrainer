// Vorlesen ueber die Stimme des Geraets. Kostet nichts und geht offline.

let stimmen = [];

function stimmenLaden() {
  stimmen = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}

if (window.speechSynthesis) {
  stimmenLaden();
  window.speechSynthesis.addEventListener('voiceschanged', stimmenLaden);
}

/** Gibt es ueberhaupt eine Stimme fuer diese Sprache? */
export function kannVorlesen(sprache = 'en') {
  if (!window.speechSynthesis) return false;
  if (stimmen.length === 0) stimmenLaden();
  if (stimmen.length === 0) return true; // manche Browser liefern die Liste erst spaeter
  return stimmen.some((s) => s.lang.toLowerCase().startsWith(sprache));
}

export function stimmenFuer(sprache = 'en') {
  if (stimmen.length === 0) stimmenLaden();
  return stimmen.filter((s) => s.lang.toLowerCase().startsWith(sprache));
}

/**
 * Liest einen Text vor.
 * @param {string} text
 * @param {'en'|'de'} sprache
 * @param {string} stimmenName bevorzugte Stimme aus den Einstellungen
 */
export function vorlesen(text, sprache = 'en', stimmenName = '') {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();

  const ansage = new SpeechSynthesisUtterance(String(text).replace(/\s*\/\s*/g, ', '));
  ansage.lang = sprache === 'de' ? 'de-DE' : 'en-GB';
  ansage.rate = 0.9;

  const passende = stimmenFuer(sprache);
  const gewuenscht = stimmenName && passende.find((s) => s.name === stimmenName);
  const stimme = gewuenscht || passende[0];
  if (stimme) ansage.voice = stimme;

  window.speechSynthesis.speak(ansage);
}

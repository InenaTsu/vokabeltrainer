// Comic-Biene als SVG. Zustaende: neutral | freut | schnute | jubel
// Bewusst als Code-Grafik gebaut, damit sie sofort laedt und animierbar ist.
// Soll sie spaeter durch gezeichnete Bilder ersetzt werden, muss nur diese
// Datei eine <img>-Auswahl statt des SVG zurueckgeben.

const F = {
  gelb: '#FFC93C',
  gelbDunkel: '#F2A71B',
  dunkel: '#3B2F2F',
  weiss: '#FFFFFF',
  fluegel: '#D9EEF9',
  fluegelRand: '#9FCFE6',
  wange: '#FF9E9E'
};

function fluegel() {
  return `
    <g opacity="0.9">
      <ellipse cx="24" cy="58" rx="15" ry="10" fill="${F.fluegel}" stroke="${F.fluegelRand}" stroke-width="2"
               transform="rotate(-22 24 58)"/>
      <ellipse cx="76" cy="58" rx="15" ry="10" fill="${F.fluegel}" stroke="${F.fluegelRand}" stroke-width="2"
               transform="rotate(22 76 58)"/>
    </g>`;
}

function koerper() {
  return `
    <g>
      <clipPath id="bauch-${koerper.id = (koerper.id || 0) + 1}">
        <ellipse cx="50" cy="79" rx="21" ry="16"/>
      </clipPath>
      <ellipse cx="50" cy="79" rx="21" ry="16" fill="${F.gelb}" stroke="${F.dunkel}" stroke-width="3"/>
      <g clip-path="url(#bauch-${koerper.id})">
        <rect x="29" y="70" width="42" height="7" fill="${F.dunkel}"/>
        <rect x="29" y="84" width="42" height="7" fill="${F.dunkel}"/>
      </g>
    </g>`;
}

function fuehler() {
  return `
    <g stroke="${F.dunkel}" stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M 39 24 Q 33 12 28 10"/>
      <path d="M 61 24 Q 67 12 72 10"/>
    </g>
    <circle cx="27" cy="9" r="4" fill="${F.dunkel}"/>
    <circle cx="73" cy="9" r="4" fill="${F.dunkel}"/>`;
}

function augeOffen(cx, cy) {
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="7.5" ry="9" fill="${F.weiss}" stroke="${F.dunkel}" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${cy + 1}" r="4.4" fill="${F.dunkel}"/>
    <circle cx="${cx - 2}" cy="${cy - 2}" r="1.8" fill="${F.weiss}"/>`;
}

function augeFroh(cx, cy) {
  return `<path d="M ${cx - 7} ${cy + 3} Q ${cx} ${cy - 7} ${cx + 7} ${cy + 3}"
                fill="none" stroke="${F.dunkel}" stroke-width="3.5" stroke-linecap="round"/>`;
}

function augeTraurig(cx, cy, nachInnen) {
  return `
    ${augeOffen(cx, cy + 1)}
    <path d="M ${cx - 8} ${cy - 9} L ${cx + 8 * nachInnen} ${cy - 11}"
          fill="none" stroke="${F.dunkel}" stroke-width="3" stroke-linecap="round"
          transform="rotate(${nachInnen * -14} ${cx} ${cy - 10})"/>`;
}

function wangen(staerke) {
  if (!staerke) return '';
  return `
    <ellipse cx="30" cy="52" rx="6" ry="4" fill="${F.wange}" opacity="${staerke}"/>
    <ellipse cx="70" cy="52" rx="6" ry="4" fill="${F.wange}" opacity="${staerke}"/>`;
}

function gesicht(zustand) {
  if (zustand === 'freut') {
    return `
      ${augeFroh(36, 44)}${augeFroh(64, 44)}
      ${wangen(0.75)}
      <path d="M 40 54 Q 50 66 60 54" fill="none" stroke="${F.dunkel}"
            stroke-width="3.5" stroke-linecap="round"/>`;
  }
  if (zustand === 'jubel') {
    return `
      ${augeFroh(36, 43)}${augeFroh(64, 43)}
      ${wangen(0.85)}
      <path d="M 38 53 Q 50 71 62 53 Q 50 58 38 53 Z" fill="${F.dunkel}"/>
      <path d="M 46 63 Q 50 68 54 63 Q 50 61 46 63 Z" fill="${F.wange}"/>`;
  }
  if (zustand === 'schnute') {
    return `
      ${augeTraurig(36, 44, 1)}${augeTraurig(64, 44, -1)}
      ${wangen(0.35)}
      <path d="M 41 62 Q 50 52 59 62" fill="none" stroke="${F.dunkel}"
            stroke-width="3.5" stroke-linecap="round"/>`;
  }
  // neutral
  return `
    ${augeOffen(36, 44)}${augeOffen(64, 44)}
    ${wangen(0.45)}
    <path d="M 43 57 Q 50 62 57 57" fill="none" stroke="${F.dunkel}"
          stroke-width="3" stroke-linecap="round"/>`;
}

/**
 * Liefert das SVG-Markup der Biene.
 * @param {'neutral'|'freut'|'schnute'|'jubel'} zustand
 * @param {string} klasse zusaetzliche CSS-Klassen fuer das <svg>
 * @param {{pink?: boolean}} opt pink = Auszeichnung fuer einen Durchlauf ohne einen
 *        einzigen Fehler; faerbt Kopf und Koerper statt gelb.
 */
export function biene(zustand = 'neutral', klasse = '', opt = {}) {
  const alteFarben = { gelb: F.gelb, gelbDunkel: F.gelbDunkel };
  if (opt.pink) {
    F.gelb = '#FF8FC0';
    F.gelbDunkel = '#E0468C';
  }
  try {
    return bieneMarkup(zustand, klasse, opt);
  } finally {
    F.gelb = alteFarben.gelb;
    F.gelbDunkel = alteFarben.gelbDunkel;
  }
}

function bieneMarkup(zustand, klasse, opt) {
  const funkeln = zustand === 'jubel' ? `
    <g fill="${F.gelbDunkel}">
      <path d="M 12 26 l 2.5 5.5 5.5 2.5 -5.5 2.5 -2.5 5.5 -2.5 -5.5 -5.5 -2.5 5.5 -2.5 Z"/>
      <path d="M 88 30 l 2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2 Z"/>
    </g>` : '';

  const label = `Biene: ${beschriftung(zustand)}${opt.pink ? ', pink' : ''}`;
  return `<svg viewBox="0 0 100 100" class="${klasse}" role="img"
    aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
    ${funkeln}
    ${fluegel()}
    ${koerper()}
    <circle cx="50" cy="45" r="27" fill="${F.gelb}" stroke="${F.dunkel}" stroke-width="3"/>
    ${fuehler()}
    ${gesicht(zustand)}
  </svg>`;
}

/* ---------- Belohnung: Sterne fuer wiederholt fehlerfreie Bereiche ---------- */

const STUFEN = [
  { name: 'Pink', farbe: '#FF5FA2', rand: '#C4276E' },
  { name: 'Orange', farbe: '#FF8A3D', rand: '#C75A12' },
  { name: 'Regenbogen', farbe: null, rand: '#7A4BA8' } // farbe: null = Farbverlauf
];

/**
 * Rechnet die Zahl der auf Anhieb fehlerfreien Durchlaeufe in Sterne und Farbstufe um.
 * Der erste bringt die pinke Biene, jeder weitere einen Stern; nach drei Sternen
 * wechselt die Farbe: Pink -> Orange -> Regenbogen.
 */
export function belohnung(perfekt = 0) {
  const punkte = Math.max(0, perfekt - 1); // der erste Anhieb-Durchlauf faerbt die Biene
  if (punkte === 0) return { sterne: 0, stufe: null, farbe: null, rand: null };

  // Erst fuellen sich die drei Sterne, danach bleiben es drei und nur die Farbe
  // wechselt weiter: Pink -> Orange -> Regenbogen.
  const sterne = Math.min(punkte, 3);
  const index = Math.min(Math.max(punkte - 3, 0), STUFEN.length - 1);
  const stufe = STUFEN[index];
  return { sterne, stufe: stufe.name, farbe: stufe.farbe, rand: stufe.rand };
}

let verlaufNummer = 0;

function sternSvg(groesse, farbe, rand) {
  const form = `M12 2.5 l2.9 6.1 6.6.9 -4.8 4.7 1.2 6.6 -5.9-3.2 -5.9 3.2 1.2-6.6 -4.8-4.7 6.6-.9 Z`;
  if (farbe) {
    return `<svg viewBox="0 0 24 24" width="${groesse}" height="${groesse}" aria-hidden="true">
        <path d="${form}" fill="${farbe}" stroke="${rand}" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>`;
  }

  const id = `regenbogen-${++verlaufNummer}`;
  return `<svg viewBox="0 0 24 24" width="${groesse}" height="${groesse}" aria-hidden="true">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="#FF4D4D"/>
          <stop offset="25%"  stop-color="#FF9F1C"/>
          <stop offset="50%"  stop-color="#FFE14D"/>
          <stop offset="72%"  stop-color="#4CC66B"/>
          <stop offset="100%" stop-color="#5B8DEF"/>
        </linearGradient>
      </defs>
      <path d="${form}" fill="url(#${id})" stroke="${rand}" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>`;
}

/** Markup der Sterne eines Bereichs. Ohne Sterne kommt nichts zurueck. */
export function sterneMarkup(perfekt = 0, groesse = 20) {
  const { sterne, stufe, farbe, rand } = belohnung(perfekt);
  if (sterne === 0) return '';

  const beschriftung = `${sterne} ${sterne === 1 ? 'Stern' : 'Sterne'} in ${stufe}`;
  let inhalt = '';
  for (let i = 0; i < sterne; i++) inhalt += sternSvg(groesse, farbe, rand);

  return `<span class="sterne" role="img" aria-label="${beschriftung}" title="${beschriftung}">
            ${inhalt}
          </span>`;
}

function beschriftung(zustand) {
  return {
    neutral: 'schaut neugierig',
    freut: 'lächelt',
    schnute: 'zieht eine Schnute',
    jubel: 'jubelt'
  }[zustand] || 'schaut neugierig';
}

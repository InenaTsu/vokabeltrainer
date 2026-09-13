/* Service Worker - nur dafuer da, dass der Vokabeltrainer auf dem Handy ohne Netz
   startet. Wird ausschliesslich ueber http(s) benutzt; beim Doppelklick auf index.html
   (file://) meldet sich hier nichts an, siehe die Registrierung am Ende von index.html.

   Bewusst NETZ ZUERST und nicht Zwischenspeicher zuerst: Ist eine Verbindung da, kommt
   immer der aktuelle Stand. Sonst spielt das Handy nach einer Aenderung wochenlang die
   alte Fassung weiter (HANDOVER.md, Fallstrick 2). Der Zwischenspeicher ist nur das
   Netz-Ersatzteil und wird bei jedem erfolgreichen Abruf aufgefrischt. Deshalb muss der
   Name hier bei neuen Fassungen NICHT hochgezaehlt werden.

   Die Vokabeln liegen NICHT hier drin, sondern in der IndexedDB (js/storage.js). Dieser
   Zwischenspeicher haelt nur die App-Dateien.

   Anders als beim Nachbarprojekt Glibber besteht die App aus vielen Dateien. Die Liste
   muss vollstaendig sein - fehlt ein Modul, startet das Handy ohne Netz nicht. Neue
   Dateien unter js/ oder css/ gehoeren hier UND in veroeffentlichen.ps1 eingetragen. */
var CACHE = "vokabeltrainer";
var FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./css/styles.css",
  "./js/main.js",
  "./js/state.js",
  "./js/storage.js",
  "./js/dom.js",
  "./js/trainer.js",
  "./js/check.js",
  "./js/anthropic.js",
  "./js/speech.js",
  "./js/bee.js",
  "./js/views/uebersicht.js",
  "./js/views/abfrage.js",
  "./js/views/verwalten.js",
  "./js/views/einstellungen.js"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(FILES); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  // Die Claude-API laeuft ueber einen anderen Server und braucht immer echtes Netz -
  // sie gehoert nicht in den Zwischenspeicher.
  if(new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(function(r){
      var kopie = r.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, kopie); });
      return r;
    }).catch(function(){
      return caches.match(e.request).then(function(m){
        return m || caches.match("./index.html");
      });
    })
  );
});

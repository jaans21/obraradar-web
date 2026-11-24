// Común a la portada (index.html) y al informe (informe.html): analítica sin cookies y tema.
import { aplicaTema, temaEfectivo } from "./map.js";

const cfg = window.OBRARADAR_CONFIG || {};

// --- tema: sigue a prefers-color-scheme salvo que la persona elija con el interruptor --------
// (el <head> ya aplica la preferencia guardada antes de pintar, para que no haya destello)
export function iniciarTema(map) {
  const btn = document.querySelector("[data-tema]");
  const raiz = document.documentElement;
  const pinta = () => {
    const t = temaEfectivo();
    if (map) aplicaTema(map, t); // la página "Qué es esto" no tiene mapa
    if (!btn) return;
    const txt = t === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
    btn.setAttribute("aria-label", txt);
    btn.title = txt;
  };
  if (btn) {
    btn.hidden = false;
    btn.onclick = () => {
      const nuevo = temaEfectivo() === "oscuro" ? "light" : "dark";
      raiz.dataset.theme = nuevo;
      try { localStorage.setItem("obraradar-tema", nuevo); } catch { /* modo privado: solo esta visita */ }
      evento(`tema-${nuevo}`);
      pinta();
    };
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!raiz.dataset.theme) pinta(); });
  pinta();
}

// --- GoatCounter: solo si hay código configurado. Los eventos llevan el nombre de la acción y
// del filtro; nada de la persona.
let pendientes = [];
if (cfg.goatcounter) {
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${encodeURIComponent(cfg.goatcounter)}.goatcounter.com/count`;
  s.onload = () => { pendientes.forEach(evento); pendientes = []; };
  document.head.append(s);
}
export function evento(nombre) {
  if (!cfg.goatcounter) return;
  if (!window.goatcounter?.count) { pendientes.push(nombre); return; }
  window.goatcounter.count({ path: nombre, title: nombre, event: true });
}

// ?og: vista para generar og.png (sin la barra superior, que en una miniatura solo hace ruido)
if (new URLSearchParams(location.search).has("og")) document.documentElement.dataset.og = "1";

/** QA de rendimiento: primer fotograma con todos los tiles y los puntos cargados. */
export function marcaCarga(map) {
  window.__mapa = map;
  document.documentElement.dataset.listo = "1";
  const marca = () => {
    if (map.areTilesLoaded()) { window.__tCarga = performance.now(); map.off("render", marca); }
  };
  map.on("render", marca);
  marca();
}

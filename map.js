// Mapa de ObraRadar: MapLibre + PMTiles de Protomaps con estilo propio (tokens de DESIGN.md §3),
// y la "Escena": el estado de cada punto (opacidad, tamaño, anillo) con transiciones reversibles.
// Usa los globales maplibregl, pmtiles y basemaps (web/static/vendor).

// Dos temas con pasos propios (no se invierte uno en otro). Los colores de tipo y la rampa están
// validados con el script de dataviz contra la superficie de cada tema (web/qa/NOTES.md, fase D).
const TEMAS = {
  claro: {
    tinta: "#18243a", calc: "#eef1ed", llosa: "#d3d9d4", aigua: "#c9d5d9",
    tipo: { obra_nova: "#2458c6", gran_rehabilitacio: "#d28a00", enderroc: "#c22f6b", altres: "#7e8792" },
    // rampa de un solo tono (tinta), validada --ordinal: monótona, extremo claro 2,15:1
    rampa: ["#94a7c3", "#7a91b4", "#5f7aa0", "#46608a", "#2d4368", "#18243a"],
    base: {
      park_a: "#e1e8e0", park_b: "#d6e2d5", scrub_a: "#e3e9e1", scrub_b: "#d9e3d8", sand: "#e8eae4",
      equip: "#e9ebe8", industrial: "#e6e9e6", peatonal: "#f4f6f3", casing: "#dfe4df", casing_mayor: "#d7ddd8",
      otra: "#f7f8f6", menor_a: "#fbfcfb", menor_b: "#ffffff", mayor: "#ffffff", via: "#b5bdb8",
      etiq_menor: "#6b7484", etiq_mayor: "#5b6576", halo: "#ffffff",
    },
  },
  oscuro: {
    tinta: "#e6ebf2", calc: "#141b26", llosa: "#232d3c", aigua: "#0f2030",
    // L 0,48-0,67, croma >= 0,1, CVD >= 8 y >= 3:1 sobre #141b26. "Otras obras" (#56606c) es el gris
    // que retrocede: más oscuro para separarse del magenta en deuteranopía (ΔE 8,5)
    tipo: { obra_nova: "#4d7ee6", gran_rehabilitacio: "#bf8a1a", enderroc: "#d65a91", altres: "#56606c" },
    // en oscuro la magnitud sube hacia la luz; --ordinal: monótona, un tono, extremo 2,09:1
    rampa: ["#3b4f70", "#4b6491", "#5c7aae", "#7392c7", "#8eaadb", "#b0c6ec"],
    base: {
      park_a: "#17231e", park_b: "#1a2822", scrub_a: "#17211d", scrub_b: "#19241f", sand: "#1a2029",
      equip: "#19212c", industrial: "#171f2a", peatonal: "#1f2836", casing: "#0f141c", casing_mayor: "#0d1219",
      otra: "#1c2532", menor_a: "#202a38", menor_b: "#243040", mayor: "#2b3748", via: "#3a4659",
      etiq_menor: "#8a96a8", etiq_mayor: "#9aa6b8", halo: "#141b26",
    },
  },
};
const copia = (o) => JSON.parse(JSON.stringify(o));
/** Tema efectivo: el elegido con el interruptor (data-theme) o, si no, el del sistema. */
export const temaEfectivo = () => {
  const d = document.documentElement.dataset.theme;
  if (d === "dark" || d === "light") return d === "dark" ? "oscuro" : "claro";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
};
// T es el tema actual; aplicaTema() lo cambia en sitio (las demás piezas leen siempre de aquí)
export const T = copia(TEMAS[temaEfectivo()]);
// tema con el que está pintado el mapa ahora mismo (el estilo nace ya con el tema efectivo)
let temaPintado = temaEfectivo();

export const BCN = [[2.052, 41.317], [2.228, 41.469]];
// Vista de las obras, calculada en el build: los límites de todas las obras de la edición. Si no está (página sin datos), los límites del municipio.
export const VISTA = window.OBRARADAR_VISTA || BCN;
export const REDUCIDO = matchMedia("(prefers-reduced-motion: reduce)");

const FUERA = new Set([
  "pois", "roads_shields", "roads_oneway", "address_label", "places_country", "places_region",
  "earth_label_islands", "water_label_ocean", "boundaries_country", "boundaries",
  // nombres de municipio: "Barcelona" tapaba los puntos del centro y los vecinos dominaban la vista
  "places_locality",
]);

function flavor() {
  const b = T.base;
  const base = basemaps.namedFlavor(T.calc === TEMAS.oscuro.calc ? "dark" : "light");
  return {
    ...base,
    background: T.calc, earth: T.calc,
    park_a: b.park_a, park_b: b.park_b, wood_a: b.park_a, wood_b: b.park_b,
    scrub_a: b.scrub_a, scrub_b: b.scrub_b, sand: b.sand, beach: b.sand,
    hospital: b.equip, industrial: b.industrial, school: b.equip, pedestrian: b.peatonal,
    zoo: b.park_a, military: b.industrial, aerodrome: b.industrial, runway: b.peatonal, pier: b.industrial,
    water: T.aigua,
    buildings: T.llosa,
    minor_service_casing: b.casing, minor_casing: b.casing, link_casing: b.casing,
    major_casing_late: b.casing_mayor, highway_casing_late: b.casing_mayor,
    major_casing_early: b.casing_mayor, highway_casing_early: b.casing_mayor,
    other: b.otra, minor_service: b.otra, minor_a: b.menor_a, minor_b: b.menor_b,
    link: b.mayor, major: b.mayor, highway: b.mayor,
    railway: b.via,
    roads_label_minor: b.etiq_menor, roads_label_minor_halo: b.halo,
    roads_label_major: b.etiq_mayor, roads_label_major_halo: b.halo,
    subplace_label: b.etiq_mayor, subplace_label_halo: T.calc,
    city_label: T.tinta, city_label_halo: T.calc,
    landcover: Object.fromEntries(Object.keys(base.landcover).map((k) => [k, T.calc])),
  };
}

const capasBase = () => basemaps.layers("protomaps", flavor(), { lang: "es" }).filter((l) => !FUERA.has(l.id));

/**
 * Cambia el tema sin recrear el estilo (setStyle perdería las fuentes propias y el estado de cada
 * punto): repinta las propiedades de color de las capas base y de las propias.
 */
export function aplicaTema(map, nombre) {
  // al arrancar el tema ya es el bueno: repintar ~100 capas solo retrasaba el primer dibujado de los
  // puntos (medido: ~650 ms en escritorio)
  if (nombre === temaPintado) return;
  temaPintado = nombre;
  Object.assign(T, copia(TEMAS[nombre]));
  for (const l of capasBase()) {
    if (!map.getLayer(l.id)) continue;
    for (const [k, v] of Object.entries(l.paint || {})) {
      if (/color/.test(k)) map.setPaintProperty(l.id, k, v);
    }
  }
  pintaPropias(map);
}

function pintaPropias(map) {
  const set = (id, k, v) => map.getLayer(id) && map.setPaintProperty(id, k, v);
  set("mascara", "fill-color", T.calc);
  set("distritos-relleno", "fill-color", rampaDistritos());
  set("distritos-linea", "line-color", T.tinta);
  set("distritos-activo", "line-gradient", gradienteContorno(1));
  set("obras", "circle-color", colorTipo());
  set("obras", "circle-stroke-color", T.calc);
  set("obras-anillo", "circle-stroke-color", T.tinta);
  set("obras-hover", "circle-color", colorTipo());
  set("obras-hover", "circle-stroke-color", T.tinta);
  set("obras-pulso", "circle-stroke-color", T.tinta);
}

function estilo(baseUrl) {
  const capas = capasBase()
    .filter((l) => !FUERA.has(l.id))
    .map((l) => {
      if (l.type === "symbol" && l.layout && l.layout["text-field"]) {
        // Nombres locales (catalán) en lugar de traducciones: name:ca y, si no hay, name
        l.layout["text-field"] = ["coalesce", ["get", "name:ca"], ["get", "name"]];
        l.layout["text-font"] = ["Noto Sans Regular"];
        // Sin versalitas ni tracking (DESIGN.md §3)
        l.layout["text-transform"] = "none";
        l.layout["text-letter-spacing"] = 0;
      }
      return l;
    });
  return {
    version: 8,
    glyphs: `${baseUrl}static/glyphs/{fontstack}/{range}.pbf`,
    sprite: `${baseUrl}static/sprites/light`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${baseUrl}static/tiles/bcn.pmtiles`,
        attribution:
          'Mapa: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> ' +
          'y <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>',
      },
    },
    layers: capas,
  };
}

// --- expresiones con mezcla de estados: valor = v0 + (v1 - v0) * t -----------------------------
const fs = (k, def) => ["coalesce", ["feature-state", k], def];
const mezcla = (k, def, t) => ["+", fs(`${k}0`, def), ["*", ["-", fs(`${k}1`, def), fs(`${k}0`, def)], t]];
// color, radio y orden por CLASE (la misma que filtra y cuenta el sitio): los derribos parciales son
// derribos; rehabilitación parcial y reforma son el gris pequeño (revisión 2: antes el mapa iba por tipo)
const RADIO = (z) => ["match", ["get", "clase"], ["rehabilitacion", "reforma"], z === 11 ? 3 : 5.5, z === 11 ? 4.5 : 8];

function pinturaPuntos(t) {
  return {
    "circle-opacity": mezcla("o", 1, t),
    "circle-stroke-opacity": mezcla("o", 1, t),
    "circle-radius": ["interpolate", ["linear"], ["zoom"],
      11, ["*", RADIO(11), mezcla("r", 1, t)],
      15, ["*", RADIO(15), mezcla("r", 1, t)]],
  };
}
function pinturaAnillo(t) {
  return {
    "circle-stroke-opacity": mezcla("a", 0, t),
    "circle-radius": ["interpolate", ["linear"], ["zoom"],
      11, ["+", ["*", RADIO(11), mezcla("r", 1, t)], 3],
      15, ["+", ["*", RADIO(15), mezcla("r", 1, t)], 4]],
  };
}

// line-gradient: tinta hasta la fracción x del recorrido, transparente después
export const gradienteContorno = (x) => x >= 1 ? ["interpolate", ["linear"], ["line-progress"], 0, T.tinta, 1, T.tinta]
  : ["step", ["line-progress"], T.tinta, Math.max(0.0001, x), "rgba(0,0,0,0)"];

/** Color por tipo de obra con el tema actual (función: cambia con el tema). */
export const colorTipo = () => ["match", ["get", "clase"],
  "obra_nova", T.tipo.obra_nova,
  "gran_rehabilitacio", T.tipo.gran_rehabilitacio,
  "enderroc", T.tipo.enderroc,
  T.tipo.altres];
const rampaDistritos = () => ["interpolate", ["linear"], fs("v", 0),
  0, T.rampa[0], 0.2, T.rampa[1], 0.4, T.rampa[2], 0.6, T.rampa[3], 0.8, T.rampa[4], 1, T.rampa[5]];

const easeOut = (x) => 1 - Math.pow(1 - x, 3);

// Centro y zoom que encajan unos límites en el hueco que deja el padding (tiles de 512 px)
const mercX = (lon) => ((lon + 180) / 360) * 512;
const mercY = (lat) => ((180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360) * 512;
function encaje([[w, s], [e, n]], pad, contenedor) {
  const ancho = Math.max(40, contenedor.clientWidth - pad.left - pad.right);
  const alto = Math.max(40, contenedor.clientHeight - pad.top - pad.bottom);
  const dx = Math.max(1e-9, mercX(e) - mercX(w));
  const dy = Math.max(1e-9, mercY(s) - mercY(n));
  const zoom = Math.min(15.5, Math.log2(Math.min(ancho / dx, alto / dy)));
  const cy = (mercY(s) + mercY(n)) / 2;
  const lat = (360 / Math.PI) * Math.atan(Math.exp(((180 - (cy / 512) * 360) * Math.PI) / 180)) - 90;
  return { center: [(w + e) / 2, lat], zoom };
}

export class Escena {
  constructor(map, obras) {
    this.map = map;
    this.feats = obras.features;
    const n = this.feats.length;
    // estado actual de cada punto: origen (0), destino (1) y progreso t
    this.v = { o: [new Float32Array(n).fill(1), new Float32Array(n).fill(1)],
               r: [new Float32Array(n).fill(1), new Float32Array(n).fill(1)],
               a: [new Float32Array(n), new Float32Array(n)] };
    this.t = 1;
    this.anim = null;
  }

  _pinta(t) {
    for (const [k, v] of Object.entries(pinturaPuntos(t))) this.map.setPaintProperty("obras", k, v);
    for (const [k, v] of Object.entries(pinturaAnillo(t))) this.map.setPaintProperty("obras-anillo", k, v);
  }

  /** Lleva cada punto a su destino. fn(props, i) -> {o, r, a}. Devuelve una promesa. */
  estado(fn, ms = 250) {
    if (REDUCIDO.matches) ms = 0;
    cancelAnimationFrame(this.anim);
    const t = this.t;
    this.feats.forEach((f, i) => {
      const d = { o: 1, r: 1, a: 0, ...fn(f.properties, i) };
      const st = {};
      for (const k of ["o", "r", "a"]) {
        const [v0, v1] = this.v[k];
        const actual = v0[i] + (v1[i] - v0[i]) * t;
        v0[i] = actual; v1[i] = d[k];
        st[`${k}0`] = actual; st[`${k}1`] = d[k];
      }
      this.map.setFeatureState({ source: "obras", id: f.id }, st);
    });
    this.t = 0;
    if (!ms) { this.t = 1; this._pinta(1); return Promise.resolve(); }
    this._pinta(0);
    return new Promise((ok) => {
      const ini = performance.now();
      const paso = (ahora) => {
        const x = Math.min(1, (ahora - ini) / ms);
        this.t = easeOut(x);
        this._pinta(this.t);
        if (x < 1) this.anim = requestAnimationFrame(paso); else ok();
      };
      this.anim = requestAnimationFrame(paso);
    });
  }

  /**
   * Mueve la cámara. Con reduced motion, sin vuelo (salto directo).
   * Todo pasa por flyTo con `padding` explícito: flyTo lo deja fijado en el mapa y fitBounds lo
   * SUMA al suyo, así que mezclarlos hacía que cada encuadre saliera más pequeño (tras abrir la
   * ficha quedaba right: 420). El zoom para encajar unos límites se calcula aquí (Mercator).
   */
  camara({ bounds, center, zoom, padding = 40, ms = 1000 }) {
    const pad = typeof padding === "number" ? { top: padding, bottom: padding, left: padding, right: padding } : padding;
    const dur = REDUCIDO.matches ? 0 : ms;
    if (bounds) ({ center, zoom } = encaje(bounds, pad, this.map.getContainer()));
    this.map.flyTo({ center, zoom, padding: pad, duration: dur, essential: false });
  }

  /** Coroplético de distritos (valores por nombre) con opacidad animada por MapLibre. */
  coropletico(valores, visible) {
    const max = Math.max(1, ...Object.values(valores || {}));
    for (const f of this.distritos.features) {
      this.map.setFeatureState({ source: "distritos", id: f.id }, { v: (valores?.[f.properties.nom] || 0) / max });
    }
    // 0,7: la escala validada es en color sólido; más transparente, el extremo claro se confundía con el fondo
    this.map.setPaintProperty("distritos-relleno", "fill-opacity", visible ? 0.7 : 0);
  }

  /** Contorno del distrito; con dibujar=true el trazo recorre el perímetro (800 ms). */
  destacaDistrito(nombre, dibujar = false) {
    cancelAnimationFrame(this.animContorno);
    this.map.setFilter("distritos-activo", ["==", ["get", "nom"], nombre || ""]);
    if (!nombre || !dibujar || REDUCIDO.matches) {
      this.map.setPaintProperty("distritos-activo", "line-gradient", gradienteContorno(1));
      return;
    }
    const ini = performance.now();
    const paso = (ahora) => {
      const x = Math.min(1, (ahora - ini) / 800);
      this.map.setPaintProperty("distritos-activo", "line-gradient", gradienteContorno(easeOut(x)));
      if (x < 1) this.animContorno = requestAnimationFrame(paso);
    };
    this.map.setPaintProperty("distritos-activo", "line-gradient", gradienteContorno(0));
    this.animContorno = requestAnimationFrame(paso);
  }
}

/**
 * interactivo: false en el informe (el mapa es escenario: nunca captura la rueda ni el dedo).
 * cooperativo: en el explorador de escritorio, zoom solo con Ctrl/⌘ + rueda.
 */
export async function crearMapa(container, { interactivo = true, cooperativo = false } = {}) {
  const baseUrl = new URL(".", location.href).href;
  const proto = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", proto.tile);

  const map = new maplibregl.Map({
    container,
    interactive: interactivo,
    cooperativeGestures: interactivo && cooperativo,
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl y la rueda del ratón para acercar el mapa",
      "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ y la rueda del ratón para acercar el mapa",
      "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
      "AttributionControl.ToggleAttribution": "Mostrar u ocultar la atribución",
    },
    style: estilo(baseUrl),
    // el mapa nace ya encuadrado en las obras: sin animación ni Collserola vacía en el primer segundo
    bounds: VISTA,
    fitBoundsOptions: { padding: 24 },
    // Límites amplios: en el móvil el encuadre lleva mucho margen inferior (la tarjeta) y unos
    // límites ajustados obligaban a acercar el zoom, con lo que la tarjeta tapaba lo que se contaba
    maxBounds: [[1.55, 40.95], [2.75, 41.85]],
    minZoom: 9.5, // el encuadre del móvil (hueco de ~270 px sobre la tarjeta) necesita alejarse más
    maxZoom: 17.5,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
  });
  if (interactivo) {
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
  }
  // Atribución siempre visible (no plegada en una "i"): DESIGN.md §13.6
  map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");

  // Los datos se piden YA, en paralelo con el estilo y los tiles (antes se esperaba al "load")
  // Un informe carga solo las obras de SU edición; la portada, todas (el histórico va en el filtro de mes)
  const ed = window.OBRARADAR_INFORME;
  const datos = Promise.all(
    [ed ? `obras-${ed}.geojson` : "obras.geojson", "distritos.geojson", "mascara.geojson", ...(ed ? [`relato-${ed}.json`] : [])]
      .map((f) => fetch(`${baseUrl}data/${f}`).then((r) => r.json())));
  // "load" solo salta cuando el mapa base está completo y dibujado: esperar a eso dejaba los puntos para
  // después (medido: ~650-850 ms tras el mapa base). Con el estilo cargado ya se pueden añadir capas, y
  // los puntos se piden y dibujan en paralelo con las teselas.
  if (!map.isStyleLoaded()) await new Promise((ok) => map.once("style.load", ok));
  const [obras, distritos, mascara, relato] = await datos;

  // Fuera del término municipal, el mapa se apaga: el escenario es Barcelona
  map.addSource("mascara", { type: "geojson", data: mascara });
  map.addLayer({ id: "mascara", type: "fill", source: "mascara",
    paint: { "fill-color": T.calc, "fill-opacity": 0.72, "fill-antialias": false } });

  map.addSource("distritos", { type: "geojson", data: distritos });
  map.addLayer({ id: "distritos-relleno", type: "fill", source: "distritos",
    paint: {
      "fill-color": rampaDistritos(),
      "fill-opacity": 0,
      "fill-opacity-transition": { duration: REDUCIDO.matches ? 0 : 600, delay: 0 },
    } });
  map.addLayer({ id: "distritos-linea", type: "line", source: "distritos",
    paint: { "line-color": T.tinta, "line-opacity": 0.28, "line-width": 1 } });
  // Contorno del distrito activo como líneas con lineMetrics: permite "dibujarlo" con line-gradient
  const contornos = { type: "FeatureCollection", features: distritos.features.flatMap((f) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    return polys.map((p) => ({ type: "Feature", properties: f.properties, geometry: { type: "LineString", coordinates: p[0] } }));
  }) };
  map.addSource("contornos", { type: "geojson", data: contornos, lineMetrics: true });
  map.addLayer({ id: "distritos-activo", type: "line", source: "contornos", filter: ["==", ["get", "nom"], ""],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-width": 2.5, "line-gradient": gradienteContorno(1) } });

  map.addSource("obras", { type: "geojson", data: obras });
  map.addLayer({ id: "obras", type: "circle", source: "obras",
    layout: { "circle-sort-key": ["match", ["get", "clase"], ["rehabilitacion", "reforma"], 0, 1] },
    paint: { "circle-color": colorTipo(), "circle-stroke-color": T.calc, "circle-stroke-width": 2, ...pinturaPuntos(1) } });
  // Anillo de tinta: obra que se está contando, en el filtro activo o seleccionada
  map.addLayer({ id: "obras-anillo", type: "circle", source: "obras",
    paint: { "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": T.tinta, "circle-stroke-width": 2,
      ...pinturaAnillo(1) } });

  const escena = new Escena(map, obras);
  escena.distritos = distritos;
  return { map, obras, distritos, relato, escena };
}

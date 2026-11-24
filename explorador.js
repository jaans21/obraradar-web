// Explorador: filtros (gremio, mes, distrito, tipo, etiquetas), lista sincronizada con el mapa,
// ficha de obra y estado en el hash de la URL (#g=&m=&d=&t=&e=&o=).
// La vista también sale del hash: sin hash, portada; con filtros o #explorador, explorador.
import { REDUCIDO, VISTA, T, colorTipo } from "./map.js";

const TIPOS = { obra_nova: "Obra nueva", gran_rehabilitacio: "Gran rehabilitación", enderroc: "Derribo",
  rehabilitacion: "Rehabilitación parcial", reforma: "Reforma u otras obras" };
// color en el mapa: rehabilitación parcial y reforma comparten el gris de la antigua "Otras obras"
const punto = (clase) => (clase === "rehabilitacion" || clase === "reforma" ? "altres" : clase);
const NT = 5;
const ETIQ = {
  amiant: "Fibrocemento o amianto", bastida: "Andamios", facana: "Fachadas y patios", coberta: "Cubiertas", canvi_us: "Cambio de uso",
  ampliacio: "Ampliación", estructural: "Estructura", ascensor: "Ascensores", patrimoni: "Patrimonio",
  segregacio: "Segregación", piscina: "Piscinas", telecom: "Telecomunicaciones", fase_previa: "Movimiento de tierras",
  legalitzacio: "Legalización",
};
const CANVI = { oficina: "oficina", local: "local", industrial: "industrial", aparcament: "aparcamiento",
  habitatge: "vivienda", docent: "docente", hotel: "hotel", equipament: "equipamiento" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
  "noviembre", "diciembre"];
const nombreMes = (m) => { const [y, mm] = m.split("-"); return `${MESES[+mm - 1]} de ${y}`; };
const fmt = (n) => n.toLocaleString("es-ES");
const movil = matchMedia("(max-width: 759px)");

// --------------------------------------------- ficha: textos de web/CONTENT.md §3 ---
// miles con punto también en 4 cifras: es-ES no agrupa 9696 y sí 15.210 (revisor, revisión 2)
const num = (n) => {
  const [ent, dec] = String(Math.round(n * 100) / 100).split(".");
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? `,${dec}` : "");
};
const lista_y = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : xs[0];
const USO = { ...CANVI, docent: "uso docente" };

/**
 * El edificio hoy, según el Catastro (scraper/catastro.py). Es el inmueble que existe: en una obra
 * nueva, el solar o el edificio anterior; en un derribo, lo que consta hoy en la parcela (puede ser
 * solo una parte de lo que se derriba).
 */
function datosInmueble(p) {
  const c = p.cat || {}, out = [];
  if (c.anio) out.push(["Año de construcción", String(c.anio)]);
  if (c.m2) out.push(["Superficie construida", `${num(c.m2)} m²`]);
  if (c.uso) out.push(["Uso principal", c.uso[0].toUpperCase() + c.uso.slice(1)]);
  if (c.plantas) out.push(["Plantas sobre rasante", num(c.plantas)]);
  if (c.sotanos) out.push(["Plantas bajo rasante", num(c.sotanos)]);
  if (c.viviendas !== undefined && c.inmuebles) {
    out.push(["Viviendas", c.viviendas === 0
      ? `Ninguna (${num(c.inmuebles)} ${c.inmuebles === 1 ? "inmueble" : "inmuebles"} de otro uso)`
      : c.inmuebles > c.viviendas ? `${num(c.viviendas)} de ${num(c.inmuebles)} inmuebles` : num(c.viviendas)]);
  }
  if (c.estado === "ruin") out.push(["Estado", "Ruinoso según el Catastro"]);
  return out;
}

/** Rótulo y nota del bloque del Catastro según el tipo de obra: va ENCIMA de los datos. */
function tituloInmueble(p) {
  if (p.cat?.dudoso) return "Datos por confirmar"; // + "según el Catastro" (no se sabe cuál falla)
  return p.tipo === "obra_nova" ? "La parcela hoy" : p.clase === "enderroc" ? "Lo construido hoy" : "El edificio hoy";
}
function notaInmueble(p) {
  const hay = Object.keys(p.cat || {}).length > 0;
  if (!hay) return "Sin coincidencia segura en el Catastro para esta dirección.";
  // choca con la licencia (scraper/catastro.coherencia): no se presenta como hecho
  if (p.cat.dudoso) return `No cuadra con la licencia: esta ${p.cat.dudoso}.`; // la referencia va debajo, con enlace
  if (p.tipo === "obra_nova") return "Es lo que consta hoy en la parcela: el solar o el edificio anterior, no el proyecto.";
  // el Catastro se casa por parcela: un derribo puede ser de una parte (copywriter, revisión 1)
  if (p.clase === "enderroc") return "Es lo que consta hoy en la parcela. La licencia puede derribar el edificio entero o solo una parte.";
  if (p.tipo === "gran_rehabilitacio" || p.etiq.includes("ampliacio"))
    return "El Catastro describe el edificio actual; la licencia, el resultado de la obra.";
  return "";
}

/** La obra, según la licencia (scraper/extract.py): solo lo que consta en la descripción. */
function datosObra(p) {
  const x = p.ext || {}, out = [];
  if (x.viviendas) out.push(["Viviendas", num(x.viviendas) + (x.vpo ? ", con vivienda protegida" : "")]);
  else if (x.vpo) out.push(["Viviendas", "Con vivienda protegida"]);
  if (x.pisos !== undefined) out.push([p.tipo === "obra_nova" ? "Plantas del proyecto" : "Plantas del edificio",
    x.pisos ? `PB + ${x.pisos}` : "Solo planta baja"]);
  if (x.sotanos) out.push(["Plantas bajo rasante", num(x.sotanos)]);
  if (x.plazas) {
    const pl = x.plazas;
    out.push(["Aparcamiento", [pl.coches && `${num(pl.coches)} coches`, pl.motos && `${num(pl.motos)} motos`,
      pl.bicis && `${num(pl.bicis)} bicis`].filter(Boolean).join(", ")]);
  }
  if (x.m2) {
    const r = { construidos: "Superficie construida", utiles: "Superficie útil", actuacion: "Superficie de actuación" };
    out.push([r[x.m2.clase], `${num(x.m2.valor)} m²`]);
  }
  if (x.amianto) {
    const que = { cubierta: "Cubierta de fibrocemento", cobertizo: "Cobertizo de fibrocemento", retirada: "Retirada de amianto",
      otro: "Fibrocemento o amianto en la licencia, sin precisar dónde" }[x.amianto.que];
    const m2 = x.m2_amianto ? `, ${num(x.m2_amianto.valor)} m²${x.m2_amianto.aprox ? " aprox." : ""}` : "";
    const cita = x.amianto.que === "retirada" ? "" : `. ${x.amianto.citado ? "La Gaseta nombra el amianto" : "La Gaseta no nombra el amianto"}`;
    out.push(["Fibrocemento o amianto", `${que}${m2}${cita}`]);
  }
  if (x.auxiliares) {
    const a = x.auxiliares;
    let v = a.no ? "La licencia indica que no se incluyen" : lista_y(a.tipos);
    if (!a.no) v = v[0].toUpperCase() + v.slice(1);
    if (a.via_publica === true) v += "; ocupa la vía pública";
    if (a.via_publica === false) v += "; sin ocupar la vía pública";
    out.push(["Andamio o medios auxiliares", v]);
  }
  // sin acción clara (el texto solo lo nombra), no se muestra: no consta qué se hace
  if (x.ascensor?.accion) {
    const a = x.ascensor;
    const v = a.accion === "nuevo" ? (a.n > 1 ? `${num(a.n)} nuevos` : "Nuevo") + (a.exterior ? (a.n > 1 ? ", exteriores" : ", exterior") : "")
      : a.accion === "sustitucion" ? "Sustitución" : a.accion === "mantenimiento" ? "Se mantiene el existente"
      : "Obra en un ascensor existente";
    out.push(["Ascensor", v]);
  }
  if (x.cambio_uso) {
    const { de, a } = x.cambio_uso;
    out.push(["Cambio de uso", de && a ? `De ${USO[de] || de} a ${USO[a] || a}` : a ? `A ${USO[a] || a}` : `Desde ${USO[de] || de}`]);
  }
  if (x.segregacion) out.push(["Segregación", `De 1 local a ${num(x.segregacion.en)} ${x.segregacion.que}`]);
  if (x.patrimonio) {
    const n = x.patrimonio.niveles, niv = `nivel${n.length > 1 ? "es" : ""} ${lista_y(n)}`;
    out.push(["Patrimonio", { edificio: `Edificio protegido, ${niv}`, entorno: `En un entorno protegido, ${niv}`,
      conjunto: `En un conjunto protegido, ${niv}` }[x.patrimonio.ambito]]);
  }
  return out;
}

const pares = (xs) => xs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

/** Street View con la URL pública de Google Maps (sin clave de API). */
const streetView = ([lon, lat]) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}`;


/**
 * Con un gremio activo, el dato de esa obra para ese gremio (lo que busca el proveedor), si la
 * línea resumen no lo dice ya. Nunca "sin andamio": que no conste no demuestra que no lo haya.
 */
function datoGremio(p, g) {
  const x = p.ext || {}, r = (p.res || "").toLowerCase();
  if (g === "andamios") {
    const a = x.auxiliares;
    if (a?.no) return "la licencia excluye medios auxiliares";
    if (!a?.tipos) return "";
    const tipos = r.includes(a.tipos[0].split(" ")[0]) ? "" : lista_y(a.tipos);
    const via = a.via_publica === true ? "ocupa la vía pública" : a.via_publica === false ? "sin ocupar la vía pública" : "";
    return [tipos, via].filter(Boolean).join(", ");
  }
  if (g === "ascensores" && x.ascensor?.accion && !r.includes("ascensor") && !r.includes("elevador")) {
    const a = x.ascensor;
    return a.accion === "nuevo" ? (a.n > 1 ? `${a.n} ascensores nuevos` : "ascensor nuevo")
      : a.accion === "sustitucion" ? "sustitución de ascensor"
      : a.accion === "mantenimiento" ? "mantenimiento del ascensor existente" : "obra en un ascensor existente";
  }
  if (g === "amianto") {
    const m2 = x.m2_amianto ? `${num(x.m2_amianto.valor)} m² de fibrocemento${x.m2_amianto.aprox ? " aprox." : ""}` : "";
    // "nombra el amianto" solo si el resumen no lo dice ya ("Retirada de amianto")
    return [m2, x.amianto?.citado && !r.includes("amianto") ? "la Gaseta nombra el amianto" : ""].filter(Boolean).join(", ");
  }
  if (g === "vivienda" && x.cambio_uso?.de && !r.includes("cambio de uso de")) return `desde ${USO[x.cambio_uso.de] || x.cambio_uso.de}`;
  if (g === "piscinas" && !r.includes("piscina")) return "con piscina";
  return "";
}

/** 4) Cuándo: concesión, publicación y qué se puede decir del estado sin afirmar lo que no se sabe. */
function cuando(p, hoy = new Date()) {
  const [y, m] = p.mes.split("-").map(Number);
  const meses = (hoy.getFullYear() - y) * 12 + (hoy.getMonth() + 1 - m);
  const conc = `Licencia concedida en ${nombreMes(p.mes)}` + (meses > 0 ? ` (hace ${meses} ${meses === 1 ? "mes" : "meses"})` : "");
  // lo que dice la propia Gaseta manda: legaliza obras ya hechas o modifica una licencia anterior
  if (p.ext?.tramite === "legaliza") return `${conc}: legaliza obras que, según la Gaseta, ya están hechas.`;
  if (p.ext?.tramite === "modifica") return `${conc}: modifica una licencia anterior; la obra puede estar ya en marcha.`;
  if (!p.pub) return `${conc}. La Gaseta no indica cuándo empieza la obra.`;
  // sin repetir el año si es el mismo (máximo 2 cifras por frase)
  const pub = p.pub.slice(0, 4) === p.mes.slice(0, 4) ? MESES[+p.pub.slice(5, 7) - 1] : nombreMes(p.pub.slice(0, 7));
  return meses <= 6
    ? `${conc}, publicada en ${pub}: la obra puede estar a punto de empezar o ya en marcha.`
    : `${conc}, publicada en ${pub}. La obra puede estar en marcha o terminada: la Gaseta no informa del estado.`;
}

// Contador que interpola de su valor actual al nuevo (200 ms). Con reduced motion, salto directo.
function animaNumero(el, hasta) {
  const desde = +(el.dataset.v ?? hasta);
  el.dataset.v = hasta;
  cancelAnimationFrame(el._raf);
  if (REDUCIDO.matches || desde === hasta) { el.textContent = fmt(hasta); return; }
  const ini = performance.now();
  const paso = (t) => {
    const x = Math.min(1, (t - ini) / 200);
    el.textContent = fmt(Math.round(desde + (hasta - desde) * (1 - Math.pow(1 - x, 3))));
    if (x < 1) el._raf = requestAnimationFrame(paso);
  };
  el._raf = requestAnimationFrame(paso);
}

export function iniciarExplorador({ map, escena, obras, distritos }, { evento }) {
  const feats = obras.features;
  const P = feats.map((f) => f.properties);
  const $ = (id) => document.getElementById(id);
  const cfg = window.OBRARADAR_CONFIG || {};
  const GREMIOS = Object.fromEntries((window.OBRARADAR_GREMIOS || []).map((g) => [g.clave, g.nombre]));
  // nota honesta por gremio (scraper/portada.py: la misma que la fila de la portada)
  const NOTA_GREMIO = Object.fromEntries((window.OBRARADAR_GREMIOS || []).map((g) => [g.clave, g.nota]));

  // ---------------------------------------------------------------- estado ---
  const estado = { g: "", m: "", d: "", t: new Set(Object.keys(TIPOS)), o: "" };
  // Ámbito: por defecto, todas las obras.
  // m = "" (todas) | "ed-AAAA-MM" (publicadas ese mes) | "AAAA-MM" (mes de concesión); "todo" (enlaces antiguos) = ""
  const ED = window.OBRARADAR_EDICION;
  const OCULTA = { o: 0, r: 0.3, a: 0 };
  const enAmbito = (p, m) => !m ? true : m.startsWith("ed-") ? p.ed === m.slice(3) : p.mes === m;
  const cumple = (p, sin = null) =>
    (sin === "g" || !estado.g || p.g.includes(estado.g)) &&
    enAmbito(p, sin === "m" ? "" : estado.m) &&
    (sin === "d" || !estado.d || p.dist === estado.d) &&
    (sin === "t" || estado.t.has(p.clase));

  // ------------------------------------------------------------ controles ---
  // lo visible ahora mismo, también en la portada (que muestra todas)
  const seVe = (p) => dentro ? cumple(p) : true;
  const meses = [...new Set(P.map((p) => p.mes))].sort().reverse();
  const ediciones = [...new Set(P.map((p) => p.ed))].sort().reverse();
  const opcion = (v, t) => `<option value="${v}">${t}</option>`;
  $("f-mes").innerHTML = opcion("", "Todos") +
    `<optgroup label="Mes de concesión">${meses.map((m) => opcion(m, nombreMes(m))).join("")}</optgroup>` +
    `<optgroup label="Mes de publicación">${ediciones.map((e) => opcion(`ed-${e}`, `Publicadas en ${nombreMes(e)}`)).join("")}</optgroup>`;
  const AMBITOS = new Set([...meses, ...ediciones.map((e) => `ed-${e}`)]);
  // total con el que se compara ("81 de 759")
  const deTotal = () => P.length;
  const dists = [...new Set(P.map((p) => p.dist).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ca"));
  $("f-dist").insertAdjacentHTML("beforeend", dists.map((d) => `<option>${d}</option>`).join(""));

  // en escritorio los 5 tipos van en una fila de celdas iguales: etiqueta corta visible, nombre completo
  // en aria-label y title (en el móvil se ve el nombre completo)
  const CORTO = { obra_nova: "Obra nueva", gran_rehabilitacio: "Gran rehab.", enderroc: "Derribo",
    rehabilitacion: "Rehab. parcial", reforma: "Reforma u otras" };
  $("f-tipo").innerHTML = Object.entries(TIPOS).map(([k, v]) =>
    `<button type="button" class="chip chaflan" data-tipo="${k}" aria-pressed="true" aria-label="${v}" title="${v}">` +
    `<span class="punto punto-${punto(k)}" aria-hidden="true"></span><span class="chip-txt" data-corto="${CORTO[k]}">${v}</span>` +
    `<span class="chip-n" data-n></span></button>`).join("");
  // gremio: el filtro principal, uno a la vez (como en la portada), con "Todos" para quitarlo
  $("f-gremio").innerHTML = [["", "Todos"], ...Object.entries(GREMIOS)].map(([k, v]) =>
    `<button type="button" class="chip chaflan" data-gremio-f="${k}" aria-pressed="false">${v}<span class="chip-n" data-n></span></button>`).join("");

  const alerta = $("alerta-gremio");
  if (cfg.form_url) { alerta.href = cfg.form_url; alerta.hidden = false; $("alerta-nota").hidden = false; }
  alerta.addEventListener("click", () => evento("alerta-gremio"));

  // ------------------------------------------------------------- lista ---
  const lista = $("lista");
  const orden = P.map((p, i) => i).sort((a, b) => P[b].mes.localeCompare(P[a].mes) || P[a].dir.localeCompare(P[b].dir, "ca"));
  lista.innerHTML = orden.map((i) => {
    const p = P[i];
    return `<li data-i="${i}"><button type="button" class="item" data-i="${i}">` +
      `<span class="punto punto-${punto(p.clase)}" aria-hidden="true"></span>` +
      `<span class="item-dir">${p.dir}<span class="item-donde"> · ${p.dist || "sin distrito"} · licencia de ${nombreMes(p.mes)}</span></span>` +
      `<span class="item-meta">${p.res || TIPOS[p.clase]}</span>` +
      `</button></li>`;
  }).join("");
  const filas = [...lista.children];
  let metaGremio = "";

  // ---------------------------------------------------------- aplicar ---
  function aplicar({ camara = false, ms = 250 } = {}) {
    if (!dentro) return;
    const visibles = P.map((p) => cumple(p));
    const n = visibles.filter(Boolean).length;

    // recuentos: cuántas quedarían con ese chip, con el resto de filtros como están
    for (const b of $("f-tipo").children) {
      const k = b.dataset.tipo;
      b.setAttribute("aria-pressed", estado.t.has(k));
      const c = P.filter((p) => p.clase === k && cumple(p, "t")).length;
      animaNumero(b.querySelector("[data-n]"), c);
      // con 0 obras se atenúa como las etiquetas vacías (sigue pulsable: es un filtro de tipo)
      b.classList.toggle("cero", c === 0);
    }
    for (const b of $("f-gremio").children) {
      const k = b.dataset.gremioF;
      b.setAttribute("aria-pressed", estado.g === k);
      // móvil: la fila de gremios hace scroll lateral; el activo, siempre a la vista
      if (estado.g === k && b.parentElement.scrollWidth > b.parentElement.clientWidth)
        b.parentElement.scrollLeft = b.offsetLeft - 16;
      if (estado.g === k && b.parentElement.scrollHeight > b.parentElement.clientHeight)
        b.parentElement.scrollTop += b.getBoundingClientRect().top - b.parentElement.getBoundingClientRect().top - 56;
      animaNumero(b.querySelector("[data-n]"), P.filter((p) => (!k || p.g.includes(k)) && cumple(p, "g")).length);
    }
    $("f-mes").value = estado.m; $("f-dist").value = estado.d;
    animaNumero($("exp-n"), n);
    $("exp-n-txt").textContent = `de ${fmt(deTotal())} ${deTotal() === 1 ? "obra" : "obras"}`;
    $("gremio-nota").textContent = NOTA_GREMIO[estado.g] || "";
    $("gremio-nota").hidden = !NOTA_GREMIO[estado.g];
    $("descargar-csv").textContent = `Descargar CSV (${fmt(n)})`;
    $("descargar-csv").setAttribute("aria-label", `Descargar CSV de ${fmt(n)} ${n === 1 ? "obra" : "obras"}`);
    $("descargar-csv").disabled = n === 0;
    $("f-limpiar").hidden = !(estado.g || estado.m || estado.d || estado.t.size < NT);
    const activos = (estado.m ? 1 : 0) + (estado.d ? 1 : 0) + (estado.t.size < NT ? 1 : 0);
    const abiertos = $("ver-filtros").getAttribute("aria-expanded") === "true";
    // el mismo nombre en los tres estados (revisores, vuelta 3)
    // verbo + objeto, el mismo nombre en los tres estados (copywriter, 2ª crítica)
    $("ver-filtros").textContent = abiertos ? "Ocultar los filtros de mes, distrito y tipo"
      : `Filtrar por mes, distrito o tipo de obra${activos ? ` (${activos} ${activos === 1 ? "activo" : "activos"})` : ""}`;

    filas.forEach((li) => { li.hidden = !visibles[+li.dataset.i]; });
    // con un gremio activo, cada fila dice por qué está en él (andamio en vía pública, 3 ascensores...)
    if (metaGremio !== estado.g) {
      metaGremio = estado.g;
      filas.forEach((li) => {
        const p = P[+li.dataset.i], extra = datoGremio(p, estado.g);
        li.querySelector(".item-meta").textContent = (p.res || TIPOS[p.clase]) + (extra ? ` · ${extra}` : "");
      });
    }
    if (hover) resalta(hover);
    vacio(n);

    const anillo = !!estado.g;
    escena.estado((p, i) => visibles[i]
      ? { o: 1, r: p.uid === estado.o ? 1.6 : 1, a: (anillo || p.uid === estado.o) ? 1 : 0 }
      : OCULTA, ms);

    if (camara) encuadra(visibles, ms === 0 ? 0 : 800);
    guardaHash();
  }

  function encuadra(visibles, ms = 800) {
    if (estado.d) {
      const f = distritos.features.find((x) => x.properties.nom === estado.d);
      if (f) return escena.camara({ bounds: bboxDe(f.geometry), padding: margen(), ms });
    }
    const pts = feats.filter((f, i) => visibles[i] && f.geometry).map((f) => f.geometry.coordinates);
    if (pts.length && (estado.m || pts.length < ED.n)) {
      const b = pts.reduce((a, [x, y]) => [[Math.min(a[0][0], x), Math.min(a[0][1], y)], [Math.max(a[1][0], x), Math.max(a[1][1], y)]],
        [[180, 90], [-180, -90]]);
      if (pts.length === 1) return escena.camara({ center: pts[0], zoom: 15, padding: margen(), ms });
      return escena.camara({ bounds: b, padding: margen(), ms });
    }
    escena.camara({ bounds: VISTA, padding: margen(), ms });
  }
  // Móvil con la ficha abierta: la hoja tapa la parte baja del mapa; el margen inferior es lo que
  // tapa, para que el punto quede en la franja visible (revisor-web, vuelta 1)
  const margen = () => {
    // abajo, sitio para la leyenda del mapa (tapaba los puntos más bajos)
    if (!movil.matches) return { top: 40, bottom: 104, left: 40, right: $("detalle").hidden ? 40 : 420 };
    if ($("detalle").hidden) return 24;
    const m = map.getContainer().getBoundingClientRect();
    const tapa = Math.max(0, m.bottom - (innerHeight - $("detalle").offsetHeight));
    return { top: 16, left: 24, right: 24, bottom: Math.min(m.height - 60, tapa + 16) };
  };
  const bboxDe = (g) => {
    const cs = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).flat(2);
    return cs.reduce((a, [x, y]) => [[Math.min(a[0][0], x), Math.min(a[0][1], y)], [Math.max(a[1][0], x), Math.max(a[1][1], y)]],
      [[180, 90], [-180, -90]]);
  };

  // ------------------------------------------------- estado vacío (con salida) ---
  function vacio(n) {
    const caja = $("vacio");
    if (n > 0) { caja.hidden = true; caja.innerHTML = ""; return; }
    // ¿qué filtro, quitado él solo, recupera más obras?
    const opciones = [
      estado.g && { txt: `el gremio «${GREMIOS[estado.g]}»`, quita: () => { estado.g = ""; }, n: P.filter((p) => cumple(p, "g")).length },
      estado.m && { txt: "el filtro de mes", quita: () => { estado.m = ""; }, n: P.filter((p) => cumple(p, "m")).length },
      estado.d && { txt: "el filtro de distrito", quita: () => { estado.d = ""; }, n: P.filter((p) => cumple(p, "d")).length },
      estado.t.size < NT && { txt: "el filtro de tipo", quita: () => { estado.t = new Set(Object.keys(TIPOS)); },
        n: P.filter((p) => cumple(p, "t")).length },
    ].filter((o) => o && o.n > 0).sort((a, b) => b.n - a.n);
    const mejor = opciones[0];
    caja.hidden = false;
    caja.innerHTML = mejor
      ? `<p>Ninguna obra cumple todos los filtros.</p><button type="button" class="boton chaflan">Quitar ${mejor.txt} y ver ${fmt(mejor.n)}</button>`
      : `<p>Ninguna obra cumple todos los filtros.</p><button type="button" class="boton chaflan">Quitar los filtros</button>`;
    caja.querySelector("button").onclick = () => {
      (mejor ? mejor.quita : limpiar)();
      escena.destacaDistrito(estado.d || null);
      aplicar({ camara: true });
    };
    caja.scrollIntoView({ block: "nearest", behavior: REDUCIDO.matches ? "instant" : "smooth" });
  }

  function limpiar() { estado.g = ""; estado.m = ""; estado.d = ""; estado.t = new Set(Object.keys(TIPOS)); }

  // ----------------------------------------------------------- eventos ---
  $("f-mes").onchange = (ev) => { estado.m = ev.target.value; evento("filtro-mes"); aplicar({ camara: true }); };
  $("f-dist").onchange = (ev) => {
    estado.d = ev.target.value; evento("filtro-distrito");
    escena.destacaDistrito(estado.d || null, true);
    aplicar({ camara: true });
  };
  $("f-tipo").onclick = (ev) => {
    const b = ev.target.closest("[data-tipo]"); if (!b) return;
    const k = b.dataset.tipo;
    estado.t.has(k) ? estado.t.delete(k) : estado.t.add(k);
    evento(`filtro-tipo-${k}`);
    aplicar();
  };
  $("f-gremio").onclick = (ev) => {
    const b = ev.target.closest("[data-gremio-f]"); if (!b) return;
    estado.g = b.dataset.gremioF;
    evento(`filtro-gremio-${estado.g || "todos"}`);
    aplicar({ camara: true });
  };

  $("f-limpiar").onclick = () => { limpiar(); escena.destacaDistrito(null); aplicar({ camara: true }); };
  $("filtros").onsubmit = (ev) => ev.preventDefault();
  $("ver-filtros").onclick = (ev) => {
    const abre = ev.currentTarget.getAttribute("aria-expanded") !== "true";
    ev.currentTarget.setAttribute("aria-expanded", abre);
    $("filtros-mas").classList.toggle("abiertos", abre);
    aplicar();
  };
  document.querySelectorAll("[data-gremio]").forEach((a) =>
    a.addEventListener("click", () => evento(`gremio-${a.dataset.gremio}`)));

  // lista <-> mapa
  lista.addEventListener("click", (ev) => {
    const b = ev.target.closest(".item"); if (!b) return;
    selecciona(P[+b.dataset.i].uid);
    // con teclado (detail 0 = Enter/Espacio), el foco pasa a la ficha; Escape lo devuelve a la lista
    if (ev.detail === 0) requestAnimationFrame(() => $("detalle").focus());
  });
  lista.addEventListener("pointerover", (ev) => { const b = ev.target.closest(".item"); resalta(b ? P[+b.dataset.i].uid : null); });
  lista.addEventListener("pointerleave", () => resalta(null));
  lista.addEventListener("focusin", (ev) => { const b = ev.target.closest(".item"); if (b) resalta(P[+b.dataset.i].uid); });

  // ------------------------------------------------ resalte y selección ---
  // hover: el punto crece y gana un anillo de tinta (capa encima, filtrada por uid)
  map.addLayer({ id: "obras-hover", type: "circle", source: "obras", filter: ["==", ["get", "uid"], ""],
    paint: { "circle-color": colorTipo(), "circle-stroke-color": T.tinta, "circle-stroke-width": 2.5,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 7, 15, 11] } });
  let hover = null;
  function resalta(uid) {
    // nunca resaltar una obra que el filtro ha ocultado (dejaba un anillo huérfano en el mapa)
    if (uid && !seVe(P.find((p) => p.uid === uid))) uid = null;
    hover = uid;
    map.setFilter("obras-hover", ["==", ["get", "uid"], uid || ""]);
    filas.forEach((li) => li.classList.toggle("resaltada", !!uid && P[+li.dataset.i].uid === uid));
  }

  function selecciona(uid) {
    const antes = estado.o;
    estado.o = uid || "";
    const i = P.findIndex((p) => p.uid === uid);
    filas.forEach((li) => li.classList.toggle("seleccionada", +li.dataset.i === i));
    if (i < 0) { cierraDetalle(); aplicar(); return; }
    // con una ficha ya abierta, la anterior sale y la nueva entra; si no, el panel se desliza
    if (antes && antes !== uid && det.classList.contains("abierto")) cambiaFicha(P[i]); else abreDetalle(P[i]);
    aplicar();
    // la cámara vuela al punto (con reduced motion, escena.camara salta sin vuelo) y, al llegar,
    // el punto hace un pulso de anillo una vez
    if (!feats[i].geometry) return; // dirección sin situar: solo ficha
    const [lon, lat] = feats[i].geometry.coordinates;
    escena.camara({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14.5), padding: margen(), ms: 800 });
    clearTimeout(pulsoT);
    pulsoT = setTimeout(() => pulso(uid), 760);
  }

  // Cambio de ficha: fundido + 10 px (sale hacia arriba, entra desde abajo), 80 + 130 ms.
  // Con reduced motion, solo el fundido.
  let cambio = null;
  async function cambiaFicha(p) {
    const c = $("det-cuerpo");
    const mov = !REDUCIDO.matches;
    cambio?.cancel();
    const sale = c.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: mov ? "translateY(-10px)" : "none" }],
      { duration: 80, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" });
    cambio = sale;
    try { await sale.finished; } catch { return; } // otra selección más reciente manda
    abreDetalle(p);
    det.scrollTop = 0;
    sale.cancel();
    cambio = c.animate([{ opacity: 0, transform: mov ? "translateY(10px)" : "none" }, { opacity: 1, transform: "none" }],
      { duration: 130, easing: "cubic-bezier(.2, .7, .2, 1)" });
  }

  // Pulso de anillo (una vez, 700 ms) sobre la obra elegida. Con reduced motion no hay pulso.
  map.addLayer({ id: "obras-pulso", type: "circle", source: "obras", filter: ["==", ["get", "uid"], ""],
    paint: { "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": T.tinta, "circle-stroke-width": 2,
      "circle-radius": 12, "circle-stroke-opacity": 0 } });
  let pulsoT = 0, pulsoRaf = 0;
  function pulso(uid) {
    cancelAnimationFrame(pulsoRaf);
    if (REDUCIDO.matches || uid !== estado.o) return;
    map.setFilter("obras-pulso", ["==", ["get", "uid"], uid]);
    const ini = performance.now();
    const paso = (ahora) => {
      const x = Math.min(1, (ahora - ini) / 700);
      map.setPaintProperty("obras-pulso", "circle-radius", 12 + 22 * (1 - Math.pow(1 - x, 3)));
      map.setPaintProperty("obras-pulso", "circle-stroke-opacity", 0.9 * (1 - x));
      if (x < 1) pulsoRaf = requestAnimationFrame(paso);
      else map.setFilter("obras-pulso", ["==", ["get", "uid"], ""]);
    };
    pulsoRaf = requestAnimationFrame(paso);
  }

  // ------------------------------------------------------------- detalle ---
  const det = $("detalle");
  function abreDetalle(p) {
    $("det-dir").textContent = p.dir;
    $("det-punto").className = `punto punto-${punto(p.clase)}`;
    $("det-tipo").textContent = TIPOS[p.clase];
    $("det-dist").textContent = p.dist || "";
    $("det-resumen").textContent = p.res || TIPOS[p.clase];
    // el edificio hoy (Catastro) y la obra (licencia): dos fuentes, dos bloques rotulados
    const inm = datosInmueble(p), nota = notaInmueble(p);
    $("det-inmueble-tit").textContent = tituloInmueble(p);
    $("det-inmueble-l").innerHTML = pares(inm);
    $("det-inmueble-l").classList.toggle("dudoso", !!p.cat?.dudoso);
    // referencia catastral con enlace a la consulta pública, para que cualquiera pueda comprobarlo
    $("det-rc-p").hidden = !p.cat?.rc;
    if (p.cat?.rc) {
      $("det-rc").textContent = p.cat.rc;
      $("det-rc").href = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?rc1=${p.cat.rc.slice(0, 7)}&rc2=${p.cat.rc.slice(7, 14)}`;
    }
    $("det-inmueble-l").hidden = !inm.length;
    $("det-inmueble-nota").textContent = nota;
    $("det-inmueble-nota").hidden = !nota;
    const obra = datosObra(p);
    $("det-obra-l").innerHTML = pares(obra);
    $("det-obra").hidden = !obra.length;
    $("det-cuando").textContent = cuando(p);
    const geo = feats[P.indexOf(p)].geometry;
    $("det-sv").hidden = !geo;
    if (geo) $("det-sv").href = streetView(geo.coordinates);
    // etiquetas técnicas: solo se muestran aquí (ya no son filtro)
    $("det-etiq").innerHTML = p.etiq.map((e) => `<span class="etiqueta">${ETIQ[e] || e}</span>`).join("");
    $("det-desc").textContent = p.desc;
    const prom = $("det-prom");
    if (p.prom) {
      prom.hidden = false;
      // la fuente es un acuerdo de la Comissió de Govern, no la licencia: se dice cuál, en vez de
      // "(a verificar)", que era jerga interna (copywriter, vuelta 1)
      prom.innerHTML = `<strong>Promotor o titular</strong> <span class="verif">(según un acuerdo de la Comissió de Govern)</span>: `;
      prom.append(document.createTextNode(p.prom));
      if (p.prom_url) {
        const a = document.createElement("a"); a.href = p.prom_url; a.target = "_blank"; a.rel = "noopener";
        a.textContent = "Ver el acuerdo de la Comissió de Govern"; prom.append(". ", a);
      }
    } else prom.hidden = true;
    $("det-gaseta").href = p.url;
    $("det-uid").textContent = p.uid;
    det.hidden = false;
    // la ficha tapaba la leyenda en pantallas medianas: con la ficha abierta, la leyenda se oculta
    // (la ficha ya dice el tipo con su color)
    document.body.classList.add("con-ficha");
    requestAnimationFrame(() => det.classList.add("abierto"));
  }
  function cierraDetalle() {
    document.body.classList.remove("con-ficha");
    det.classList.remove("abierto");
    const fin = () => { if (!det.classList.contains("abierto")) det.hidden = true; };
    if (REDUCIDO.matches) fin(); else setTimeout(fin, 230);
  }
  $("det-cerrar").onclick = () => { const uid = estado.o; selecciona(null); devolverFoco(uid); };
  det.addEventListener("keydown", (ev) => { if (ev.key === "Escape") $("det-cerrar").click(); });
  $("det-sv").addEventListener("click", () => evento("street-view"));
  function devolverFoco(uid) {
    const li = filas.find((l) => P[+l.dataset.i].uid === uid);
    li?.querySelector(".item")?.focus();
  }

  // --------------------------------------- hoja inferior arrastrable (móvil) ---
  // Se arrastra desde el asa o la franja superior: hacia abajo más de 90 px la cierra; si no, vuelve
  const asideros = [det.querySelector(".det-asa"), det.querySelector(".det-cabeza")];
  let arrastre = null;
  asideros.forEach((el) => el.addEventListener("pointerdown", (ev) => {
    if (!movil.matches) return;
    arrastre = { y0: ev.clientY, dy: 0 };
    det.style.transition = "none";
    el.setPointerCapture(ev.pointerId);
  }));
  asideros.forEach((el) => el.addEventListener("pointermove", (ev) => {
    if (!arrastre) return;
    arrastre.dy = Math.max(0, ev.clientY - arrastre.y0);
    det.style.transform = `translateY(${arrastre.dy}px)`;
  }));
  const suelta = () => {
    if (!arrastre) return;
    const cerrar = arrastre.dy > 90;
    arrastre = null;
    det.style.transition = ""; det.style.transform = "";
    if (cerrar) $("det-cerrar").click();
  };
  asideros.forEach((el) => { el.addEventListener("pointerup", suelta); el.addEventListener("pointercancel", suelta); });

  // ----------------------------------------------------------- copiar ---
  async function copia(boton, texto) {
    // writeText puede quedarse colgado si el navegador no concede el permiso: a los 800 ms, vía alternativa
    const limite = new Promise((_, no) => setTimeout(() => no(new Error("sin respuesta")), 800));
    try { await Promise.race([navigator.clipboard.writeText(texto), limite]); } catch {
      const ta = Object.assign(document.createElement("textarea"), { value: texto });
      document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    boton.textContent = boton.dataset.ok; boton.classList.add("hecho");
    clearTimeout(boton._t);
    boton._t = setTimeout(() => { boton.textContent = boton.dataset.txt; boton.classList.remove("hecho"); }, 1600);
  }
  $("det-copiar").onclick = (ev) => {
    const p = P.find((x) => x.uid === estado.o);
    if (p) copia(ev.currentTarget, `${p.dir}, Barcelona`);
  };
  // CSV de lo filtrado: ; como separador y BOM, para que Excel en castellano lo abra bien
  $("descargar-csv").onclick = () => {
    const vis = P.map((p, i) => [p, i]).filter(([p]) => cumple(p));
    const esc = (v) => { const t = v == null ? "" : String(v); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    // con lo que decide una visita: viviendas, plantas, andamio, ascensor, m² de fibrocemento (copywriter)
    const cab = ["direccion", "distrito", "mes_concesion", "publicacion", "tipo", "resumen", "gremios", "etiquetas",
      "viviendas_licencia", "plantas_licencia", "andamio", "ascensor", "m2_fibrocemento", "cambio_uso",
      "catastro_anio", "catastro_m2", "catastro_uso", "catastro_plantas", "catastro_viviendas", "catastro_ref",
      "catastro_por_confirmar", "gaseta_pdf", "lat", "lon"];
    const filas = vis.map(([p, i]) => {
      const c = p.cat || {}, x = p.ext || {}, [lon, lat] = feats[i].geometry?.coordinates || ["", ""];
      const aux = x.auxiliares ? (x.auxiliares.no ? "excluidos" : x.auxiliares.tipos.join(", ")) : "";
      const asc = x.ascensor?.accion ? `${x.ascensor.accion}${x.ascensor.n > 1 ? ` (${x.ascensor.n})` : ""}` : "";
      const cu = x.cambio_uso ? `${USO[x.cambio_uso.de] || x.cambio_uso.de || "?"} > ${USO[x.cambio_uso.a] || x.cambio_uso.a || "?"}` : "";
      return [`${p.dir}, Barcelona`, p.dist, p.mes, p.pub, TIPOS[p.clase], p.res, p.g.map((g) => GREMIOS[g]).join(", "),
        p.etiq.map((e) => ETIQ[e] || e).join(", "), x.viviendas, x.pisos !== undefined ? `PB+${x.pisos}` : "", aux, asc,
        x.m2_amianto?.valor, cu, c.anio, c.m2, c.uso, c.plantas, c.viviendas, c.rc, c.dudoso || "", p.url, lat, lon].map(esc).join(";");
    });
    const blob = new Blob(["﻿" + [cab.join(";"), ...filas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob), download: `obraradar-bcn-${estado.g || "obras"}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    evento(`csv-${estado.g || "todas"}`);
  };
  $("copiar-vista").onclick = (ev) => { evento("copiar-enlace"); copia(ev.currentTarget, location.href); };

  // ------------------------------------------------------------- hash ---
  function guardaHash() {
    if (!dentro) return;
    const q = new URLSearchParams();
    if (estado.g) q.set("g", estado.g);
    if (estado.m) q.set("m", estado.m);
    if (estado.d) q.set("d", estado.d);
    if (estado.t.size < NT) q.set("t", [...estado.t].join(","));
    if (estado.o) q.set("o", estado.o);
    const h = q.toString();
    // replaceState: los filtros no llenan el historial; "Atrás" vuelve a la portada
    history.replaceState(null, "", h ? `#${h}` : "#explorador");
  }
  /** Lee el hash y devuelve la vista: "portada" o "explorador". */
  function leeHash() {
    const h = location.hash.slice(1);
    if (!h) return "portada";
    limpiar(); estado.o = "";
    if (h === "explorador") return "explorador";
    const q = new URLSearchParams(h);
    if (![...q.keys()].some((k) => "gmdteo".includes(k))) return "portada";
    estado.g = q.get("g") in GREMIOS ? q.get("g") : "";
    estado.m = AMBITOS.has(q.get("m")) ? q.get("m") : "";
    estado.d = dists.includes(q.get("d")) ? q.get("d") : "";
    if (q.get("t")) estado.t = new Set(q.get("t").split(",").filter((k) => k in TIPOS));
    // enlaces compartidos antes de quitar las etiquetas del filtro: #e=amiant -> gremio amianto
    const ANTIGUAS = { amiant: "amianto", bastida: "andamios", facana: "andamios", ascensor: "ascensores", piscina: "piscinas" };
    const vieja = (q.get("e") || "").split(",").map((k) => ANTIGUAS[k]).find(Boolean);
    if (!estado.g && vieja) estado.g = vieja;
    // "altres" (antes "Otras obras") son ahora dos tipos
    if (q.get("t")?.includes("altres")) estado.t = new Set([...estado.t, "rehabilitacion", "reforma"]);
    // un enlace compartido a una obra de una edición anterior abre su edición
    const obra = P.find((p) => p.uid === q.get("o"));
    estado.o = obra ? obra.uid : "";
    if (obra && !enAmbito(obra, estado.m)) estado.m = "";
    return "explorador";
  }

  // ---------------------------------------- portada <-> explorador ---
  let dentro = false;
  // El contenedor del mapa cambia de tamaño entre vistas (en el móvil, la portada no lo muestra):
  // resize en el frame siguiente, cuando el layout nuevo ya existe; después, la cámara.
  const relayout = () => new Promise((ok) => requestAnimationFrame(() => { map.resize(); ok(); }));

  async function irA(primera = false) {
    const vista = leeHash();
    const desdePortada = !dentro;
    dentro = vista === "explorador";
    gremioHover = null;
    document.body.dataset.vista = vista;
    await relayout();
    if (dentro) {
      escena.destacaDistrito(estado.d || null);
      const p = estado.o && P.find((x) => x.uid === estado.o);
      if (p) { filas.forEach((li) => li.classList.toggle("seleccionada", P[+li.dataset.i].uid === p.uid)); abreDetalle(p); }
      else { cierraDetalle(); filas.forEach((li) => li.classList.remove("seleccionada")); }
      aplicar({ camara: true, ms: primera ? 0 : 250 });
      // con teclado, al entrar desde un gremio el foco va al recuento del explorador
      if (desdePortada && !primera && focoAlEntrar) $("exp-titulo").focus();
      focoAlEntrar = false;
    } else {
      cierraDetalle();
      resalta(null);
      escena.destacaDistrito(null);
      escena.estado(() => ({ o: 1, r: 1, a: 0 }), primera ? 0 : 250);
      escena.camara({ bounds: VISTA, padding: movil.matches ? 24 : 40, ms: primera ? 0 : 800 });
    }
  }
  // al entrar desde un gremio, "Ver todas" o el enlace de salto, el foco va al recuento del
  // explorador (tras navegar por el ancla, el elemento activo ya no es el enlace: se marca al pulsar)
  let focoAlEntrar = false;
  document.addEventListener("click", (ev) => { if (ev.target.closest(".saltar, [data-gremio], .portada a")) focoAlEntrar = true; });
  addEventListener("hashchange", () => irA());

  // Portada: pasar el ratón (o el foco) por un gremio resalta sus obras en el mapa, con anillo, y
  // atenúa el resto. Es una acción de la persona (catálogo de microinteracciones), 200 ms.
  let gremioHover = null;
  function resaltaGremio(k) {
    if (dentro || k === gremioHover) return;
    gremioHover = k;
    escena.estado((p) => !k ? { o: 1, r: 1, a: 0 }
      : p.g.includes(k) ? { o: 1, r: 1.3, a: 1 } : { o: 0.15, r: 0.7, a: 0 }, 200);
  }
  document.querySelectorAll(".gremio").forEach((a) => {
    a.addEventListener("pointerenter", () => resaltaGremio(a.dataset.gremio));
    a.addEventListener("pointerleave", () => resaltaGremio(null));
    a.addEventListener("focus", () => resaltaGremio(a.dataset.gremio));
    a.addEventListener("blur", () => resaltaGremio(null));
  });
  irA(true);

  // ------------------------------------------------------- mapa: puntero ---
  const hueco = $("exp-mapa");
  const tip = document.createElement("div");
  tip.className = "tooltip"; tip.hidden = true; tip.setAttribute("role", "tooltip");
  hueco.append(tip);
  map.on("mousemove", "obras", (ev) => {
    const i = ev.features.map((f) => f.id).find((id) => seVe(P[id]));
    if (i === undefined) return;
    map.getCanvas().style.cursor = "pointer";
    resalta(P[i].uid);
    if (!movil.matches) {
      tip.hidden = false;
      tip.innerHTML = `<strong>${P[i].dir}</strong><span>${P[i].res || TIPOS[P[i].clase]}</span>`;
      tip.style.transform = `translate(${ev.point.x + 14}px, ${ev.point.y - 12}px)`;
    }
  });
  map.on("mouseleave", "obras", () => { map.getCanvas().style.cursor = ""; tip.hidden = true; resalta(null); });
  map.on("click", "obras", (ev) => {
    const i = ev.features.map((f) => f.id).find((id) => seVe(P[id]));
    if (i === undefined) return;
    tip.hidden = true;
    // en la portada, un punto abre el explorador con esa obra
    if (!dentro) { location.hash = `o=${encodeURIComponent(P[i].uid)}`; return; }
    selecciona(P[i].uid);
  });

  window.__explorador = { estado, aplicar, selecciona, irA, obras: P };
}

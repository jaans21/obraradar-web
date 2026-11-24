// Relato con scrollytelling: cada paso declara su estado COMPLETO (puntos, cámara, coroplético),
// así que volver atrás con el scroll restaura el paso anterior sin acumular cambios.
import { BCN, REDUCIDO } from "./map.js";

const GRANDES = new Set(["obra_nova", "gran_rehabilitacio", "enderroc"]);
const movil = matchMedia("(max-width: 759px)");

export function iniciarRelato({ map, escena, relato }) {
  const pasos = [...document.querySelectorAll(".pasos .paso")];
  const tieneEtiq = (p, e) => (p.etiq || []).includes(e);

  // Margen de cámara: en el móvil la tarjeta ocupa el tercio inferior y no debe tapar lo que se cuenta
  const margen = (paso) => {
    // escritorio: abajo, sitio para la leyenda (~90 px), que tapaba obras en los pasos con zoom
    if (!movil.matches) return { top: 72, bottom: 104, left: 28, right: 28 };
    const tarjeta = paso?.querySelector(".tarjeta");
    const alto = tarjeta ? tarjeta.getBoundingClientRect().height : 300;
    // móvil: la tarjeta más 40 px, para que el anillo de la obra más baja no quede cortado
    return { top: 124, bottom: Math.min(alto + 40, innerHeight * 0.62), left: 24, right: 24 };
  };

  const ESTADOS = {
    entrada: (paso) => {
      escena.coropletico(null, false); escena.destacaDistrito(null);
      escena.camara({ bounds: BCN, padding: margen(paso) });
      return escena.estado(() => ({ o: 1, r: 1, a: 0 }));
    },
    tipos: (paso) => {
      escena.coropletico(null, false); escena.destacaDistrito(null);
      escena.camara({ bounds: BCN, padding: margen(paso) });
      return escena.estado((p) => GRANDES.has(p.clase) ? { o: 1, r: 1.15 } : { o: 0.22, r: 0.8 });
    },
    distritos: (paso) => {
      const grandes = Object.fromEntries(Object.entries(relato.distritos).map(([k, v]) => [k, v.grandes]));
      escena.coropletico(grandes, true);
      escena.destacaDistrito(relato.lider_total, true);
      escena.camara({ bounds: BCN, padding: margen(paso) });
      return escena.estado((p) => GRANDES.has(p.clase) ? { o: 0.9, r: 0.8 } : { o: 0, r: 0.6 });
    },
    grande: (paso) => {
      const uid = paso.dataset.uid;
      const g = relato.grandes.find((x) => x.uid === uid);
      escena.coropletico(null, false); escena.destacaDistrito(null);
      if (g) escena.camara({ center: [g.lon, g.lat], zoom: 15.2, padding: margen(paso), ms: 1100 });
      return escena.estado((p) => p.uid === uid ? { o: 1, r: 1.6, a: 1 } : { o: 0.18, r: 0.8 });
    },
    amiant: (paso) => {
      escena.coropletico(null, false); escena.destacaDistrito(null);
      if (relato.bbox_amiant) escena.camara({ bounds: relato.bbox_amiant, padding: margen(paso) });
      return escena.estado((p) => tieneEtiq(p, "amiant") ? { o: 1, r: 1.3, a: 1 } : { o: 0.12, r: 0.7 });
    },
    canvi: (paso) => {
      escena.coropletico(null, false); escena.destacaDistrito(null);
      if (relato.bbox_canvi) escena.camara({ bounds: relato.bbox_canvi, padding: margen(paso) });
      return escena.estado((p) => tieneEtiq(p, "canvi_us") ? { o: 1, r: 1.25, a: 1 } : { o: 0.12, r: 0.7 });
    },
    patrimoni: (paso) => {
      escena.coropletico(null, false); escena.destacaDistrito(null);
      escena.camara({ bounds: BCN, padding: margen(paso) });
      return escena.estado((p) => tieneEtiq(p, "patrimoni") ? { o: 1, r: 1.15, a: 1 } : { o: 0.15, r: 0.75 });
    },
    explorar: (paso) => {
      escena.coropletico(null, false); escena.destacaDistrito(null);
      escena.camara({ bounds: BCN, padding: margen(paso) });
      return escena.estado(() => ({ o: 1, r: 1, a: 0 }));
    },
  };

  // --- secuencia de entrada: única animación no provocada por la persona (DESIGN.md §6) ---
  let entradaHecha = false;
  async function entrada() {
    entradaHecha = true;
    if (REDUCIDO.matches) return ESTADOS.entrada(pasos[0]);
    await escena.estado(() => ({ o: 0, r: 0.3 }), 0);
    for (const mes of relato.meses) {
      if (actual !== "entrada") return; // la persona ya ha bajado: manda su scroll
      await escena.estado((p) => (p.mes <= mes ? { o: 1, r: 1 } : { o: 0, r: 0.3 }), 650);
      await new Promise((ok) => setTimeout(ok, 150));
    }
  }

  // --- observador: el paso que cruza la mitad de la pantalla es el activo ---
  let actual = null;
  function activa(paso) {
    const id = paso.dataset.paso === "grande" ? `grande:${paso.dataset.uid}` : paso.dataset.paso;
    if (id === actual) return;
    actual = id;
    pasos.forEach((p) => p.classList.toggle("activo", p === paso));
    document.body.dataset.paso = paso.dataset.paso;
    if (paso.dataset.paso === "entrada" && !entradaHecha) return entrada();
    return ESTADOS[paso.dataset.paso](paso);
  }

  const io = new IntersectionObserver((entradas) => {
    for (const en of entradas) if (en.isIntersecting) activa(en.target);
  }, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });
  pasos.forEach((p) => io.observe(p));
  activa(pasos[0]);

  // --- barra de progreso del relato ---
  const barra = document.querySelector(".progreso span");
  const relatoEl = document.getElementById("relato");
  let pendiente = false;
  const progreso = () => {
    pendiente = false;
    const r = relatoEl.getBoundingClientRect();
    const total = r.height - innerHeight;
    const x = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
    barra.style.transform = `scaleX(${x})`;
  };
  addEventListener("scroll", () => { if (!pendiente) { pendiente = true; requestAnimationFrame(progreso); } },
    { passive: true });
  progreso();

  // Para el QA: ir a un paso concreto y esperar a que su estado esté aplicado
  window.__irPaso = async (i) => {
    const p = pasos[i];
    p.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise((ok) => setTimeout(ok, 50));
    return activa(p);
  };
  window.__numPasos = pasos.length;

  return {
    // al volver del explorador: reaplicar el paso en el que está la persona
    reaplicar() {
      const paso = pasos.find((p) => p.dataset.paso === (actual || "").split(":")[0] &&
        (!actual.includes(":") || p.dataset.uid === actual.split(":")[1])) || pasos[pasos.length - 1];
      actual = null;
      entradaHecha = true;
      activa(paso);
    },
  };
}

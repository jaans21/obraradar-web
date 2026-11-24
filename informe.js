// Informe de una edición: relato con scrollytelling sobre un mapa que no es interactivo.
// (Si lo fuera, la rueda y el dedo moverían el mapa en vez de la página: el mapa no roba el scroll.)
import { crearMapa } from "./map.js";
import { iniciarRelato } from "./relato.js";
import { iniciarTema, marcaCarga } from "./comun.js";

const ctx = await crearMapa(document.getElementById("mapa"), { interactivo: false });
iniciarRelato(ctx);
iniciarTema(ctx.map);
marcaCarga(ctx.map);

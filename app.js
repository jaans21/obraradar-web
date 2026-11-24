// Portada = herramienta (index.html): la portada con los gremios y el explorador comparten
// pantalla y mapa. La vista (portada / explorador) la decide el hash; la página nunca scrollea:
// solo el panel lateral, con scroll propio.
import { crearMapa } from "./map.js";
import { iniciarExplorador } from "./explorador.js";
import { evento, iniciarTema, marcaCarga } from "./comun.js";

// Escritorio (puntero fino): Ctrl/⌘ + rueda para el zoom, para que la rueda nunca se confunda
// con el scroll del panel. En táctil el mapa ocupa su propio hueco y se mueve con un dedo.
const cooperativo = matchMedia("(pointer: fine)").matches;
const ctx = await crearMapa(document.getElementById("mapa"), { interactivo: true, cooperativo });
iniciarExplorador(ctx, { evento });
iniciarTema(ctx.map);
marcaCarga(ctx.map);

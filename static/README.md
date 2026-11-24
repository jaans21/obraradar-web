# Recursos estáticos alojados en el repo

Nada de esto se carga desde un CDN en tiempo de ejecución. `build_web.py` lo copia a `web/dist/static/`.

| Ruta | Qué es | Versión / origen | Licencia |
|---|---|---|---|
| `tiles/bcn.pmtiles` | Extracto del mapa base, bbox `2.03,41.29,2.32,41.50`, zoom 0-15 (31 MB) | Build diario de Protomaps `20261122` (esquema 4.15.2), extraído con `pmtiles extract` v1.31.2 | Datos © colaboradores de OpenStreetMap (ODbL) |
| `vendor/maplibre-gl.js`, `.css` | MapLibre GL JS | 5.24.0 (npm) | BSD-3-Clause (`LICENSE-maplibre-gl.txt`) |
| `vendor/pmtiles.js` | Lector de PMTiles para MapLibre | 4.5.0 (npm) | BSD-3-Clause |
| `vendor/protomaps-basemaps.js` | Capas del estilo Protomaps, que recoloreamos en `web/src/map.js` | @protomaps/basemaps 5.7.2 (npm) | BSD-3-Clause |
| `glyphs/` | Glifos PBF de Noto Sans (Regular, Medium, Italic; rangos 0-511 y 8192-8447) | protomaps/basemaps-assets | SIL OFL 1.1 (`glyphs/OFL.txt`) |
| `sprites/` | Sprite "light" v4 | protomaps/basemaps-assets | MIT, derivado de tangrams/icons (`sprites/LICENSE-tangrams-icons.md`) |
| `fonts/archivo-*.woff2` | Archivo variable (ejes de anchura 62-125 y peso 100-900), subconjuntos latino y latino extendido | Google Fonts, v25 | SIL OFL 1.1 (`fonts/OFL-archivo.txt`) |

## Actualizar el mapa base

```bash
pmtiles extract https://build.protomaps.com/AAAAMMDD.pmtiles web/static/tiles/bcn.pmtiles \
  --bbox=2.03,41.29,2.32,41.50 --maxzoom=15
```

La lista de builds está en `https://build-metadata.protomaps.dev/builds.json`. Si cambia el esquema
mayor de los tiles, hay que actualizar también `@protomaps/basemaps`.

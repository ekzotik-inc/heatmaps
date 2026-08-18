# Basemap provider migration — 2026-08-18

## Incident

The application used the legacy 2GIS URL:

```text
https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1
```

2GIS now documents the Raster Tiles API with the versioned endpoint:

```text
https://tile{n}.maps.2gis.com/v2/tiles/{tileset}/{z}/{x}/{y}.png?key={key}
```

The documented endpoint requires a 2GIS access key and a supported tileset such as `online_hd` or `online_sd`. The legacy URL therefore returned the visible unsupported-service overlay shown in production.

## Fix

For immediate recovery without introducing a new secret or paid map API dependency, the basemap was moved to the standard OpenStreetMap raster endpoint:

```text
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

Leaflet continues to request only the visible viewport tiles. Attribution was updated to the visible OpenStreetMap contributors link. A browser-like request with the production GitHub Pages Referer and an identifiable application User-Agent returned HTTP 200; an anonymous curl without identification was blocked according to OSM tile policy.

Heatmap layers, markers, city filters, viewport logic and application data are independent from the basemap and were not changed.

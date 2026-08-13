# Project updates

## 2026-08-13 — City filter and map navigation

### Scope

The Uzbekistan city filter was extended with Gulistan, Denau, Jizzakh, Zarafshan, Qarshi, Namangan, Nukus, Termez, Urgench, Shahrisabz and Chirchiq. The visible labels intentionally remain in Russian: «Гулистан», «Денау», «Джизак», «Зарафшан», «Карши», «Наманган», «Нукус», «Термез», «Ургенч», «Шахрисабз», «Чирчик».

### Centroids

| City | Latitude | Longitude |
|---|---:|---:|
| Гулистан | 40.522 | 68.780 |
| Денау | 38.267 | 67.899 |
| Джизак | 40.133 | 67.823 |
| Зарафшан | 41.572 | 64.196 |
| Карши | 38.841 | 65.800 |
| Наманган | 41.000 | 71.673 |
| Нукус | 42.460 | 59.618 |
| Термез | 37.244 | 67.283 |
| Ургенч | 41.552 | 60.631 |
| Шахрисабз | 39.053 | 66.828 |
| Чирчик | 41.473 | 69.581 |

### Navigation behavior

Selecting a city now starts a short Leaflet `flyTo`/`flyToBounds` transition. The map stops an unfinished flight before starting the next one, uses a 620 ms duration with restrained easing, and applies padding so the city is not hidden under the floating top bar. A small focus pulse on the selected city button provides visual feedback without adding another blocking animation. The reduced-motion media preference disables that decorative pulse.

The expensive layer rebuild is scheduled after the first animation frame. This keeps the beginning of the flight responsive when a dataset is large and collapses repeated rapid clicks into the latest requested city.

### Correctness fixes

Uploaded custom-point layers now follow the selected city filter using the existing nearest-city rule with a 60 km guard. Their visible markers, coverage circles and bounds are filtered consistently. The «Все» mode still includes all heat and custom points and uses the same navigation helper for a complete fit.

### Coordinates and sources

Centroids were checked against [Wikipedia’s list of cities in Uzbekistan](https://en.wikipedia.org/wiki/List_of_cities_in_Uzbekistan), [d-maps’ Uzbekistan main-city map](https://www.d-maps.com/carte.php?num_car=108884&lang=ru), and [Orexca’s Denau guide](https://www.orexca.com/rus/uzbekistan/denau.htm). The raw geocoding output is retained in `city_geocode_results.json`; research notes are in `city_research.md`.

### Verification plan

Before publication, run JavaScript syntax checks, ESLint, a clean dependency installation, and a browser smoke test covering Tashkent, each newly added city, «Все», rapid city changes, and the mobile horizontal city bar. Confirm that the app still loads the protected data only after login.

### Local smoke test

The local browser test produced 19 Uzbekistan city buttons including all 11 requested cities. Tashkent became selected and triggered the `is-flying` focus state. A rapid sequence of Chirchiq → Tashkent → Nukus ended on Nukus, reached approximately 42.460, 59.618 at zoom 12, and cleared the focus pulse after the short animation window.

The style asset cache-buster was advanced to `20260813b` so the city-bar focus styling is fetched together with this release.

### Live smoke test

After GitHub Pages deployment for commit `39804a1`, the published page loaded the updated assets. The live browser test found 19 Uzbekistan city buttons with no missing requested cities. A rapid Tashkent → Chirchiq → Namangan sequence ended at Namangan (about 41.000, 71.673, zoom 12), and the focus pulse cleared as expected.

## 2026-08-13 — Basic city statistics

The City tab now contains baseline cards for all 11 newly added Uzbekistan cities. Each card includes population, estimated 21+ population, estimated smoker audience using the existing country-level smoking assumptions, regional average wage, region label and three neutral market-context notes.

Population values are city-level figures with the source/date shown in `popNote`. Regional wage is not presented as a city wage: it is the National Statistics Committee’s average monthly nominal accrued wage for the corresponding region for January–September 2025. Zarafshan is explicitly labelled as an estimate because a comparable current city-level official figure was not available in the consolidated source set. The source trail and selected values are recorded in `city_stats_research.md`.

The Uzbekistan wage label was also clarified from `сум/мес (2025)` to `сум/мес (янв–сен 2025)`, and the City-tab footnote now distinguishes city-level population sources from regional wage data.

### Statistics smoke test

The local browser test confirmed `allStats=true` for all 11 new cities and a population tile was rendered for every one. The initial check used `innerText` while the City tab was hidden, so it did not count the business-notes section even though the DOM was populated; the follow-up verification uses `textContent` and the visible-tab flow.

A follow-up DOM verification using `textContent` confirmed `allCards=true`: every new city renders three City-tab cards, including the population tile, the live points metric, the business-notes section and the source note.

The statistics release also advances the `app.js` cache-buster to `20260813c`; this is required because the previous navigation release used `20260813a` and a CDN could otherwise serve the older client bundle.

### Final live statistics test

After the cache-busting release `69de2d9`, the published browser bundle rendered complete City-tab cards for all 11 new cities. Every card contained a population block, business notes and the National Statistics Committee regional-wage source note; Zarafshan also retained its explicit estimate label.

### Multi-select smoke test

The local browser test confirmed: the compact city popover opens; 19 city options are available; Tashkent, Samarkand and Nukus can be selected together; the trigger shows `Ташкент + 2` with a count badge of `3`; the City tab renders a combined summary; the map frames the selected territory; and a click outside closes the popover.

The visual local check measured the city popover at 340×462 px on desktop. It stayed within the map viewport, presented all city options in a compact two-column scrollable list, and kept the trigger label `Ташкент + 2` readable while the map and summary remained visible.

## 2026-08-13 — Compact city multi-select

The overflowing one-row city pill strip was replaced by a compact `Города` trigger with a popover. The popover includes search, a two-column scrollable checkbox list, `Все города`, a selected-count badge, a clear action, Escape/outside-click closing and keyboard-readable ARIA state.

The filter now accepts any set of cities. Heat layers, recommendations, custom points, coverage circles, address-program input, exports, map bounds and City-tab statistics all use the same selected set. When several cities are selected, the City tab shows a population-weighted aggregate summary instead of an empty card. Export/import keeps `selectedCities` and remains compatible with old single-city files.

The control is compact on desktop and opens above the bottom toolbar on mobile; the horizontal city overflow strip is removed. The existing short map animation remains in place, while rapid selection updates continue to use the latest requested state.

After the final local cache-bust reload, the selection test still passed with 19 options, three selected cities, aggregate City-tab content, the compact label `Ташкент + 2`, and correct Russian pluralization (`5 городов`). Clear returned the label to `Все города` and the selection array to empty; the popover intentionally stays open so users can continue adjusting the filter.

The search/state test passed: searching `нук` leaves only Нукус visible; `selectedCities` is included in exports; multi-select restores as `Ташкент + Нукус`; and a legacy snapshot with `city: Самарканд` restores to a single selected city.

The multi-select release advances the asset versions to `app.js?v=20260813d` and `style.css?v=20260813c` to prevent the previous city-bar bundle or styles from being served from cache.

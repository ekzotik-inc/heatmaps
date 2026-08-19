# Point visibility and solo reload check — 2026-08-19

The first production navigation to `https://ekzotik-inc.github.io/heatmaps/` exposed the Heat Map shell, login controls, map controls and the `Точки` tab. A subsequent browser view unexpectedly returned `about:blank` with no elements, so this initial attempt does not provide an authenticated persistence result. No credentials were entered and no data or settings were changed.


The production form was already populated in the authenticated browser session context. The existing login button was clicked to start the read-only verification; no credential values are recorded in this evidence. No write or configuration action was performed.


The authenticated Com Dep map opened successfully. The production UI showed four point layers (`DS`, `BR точки`, `IPSE`, `BR&IPSE`) and a points-tab badge of `1/4`; the map and point list loaded without any settings being changed. This is the baseline before reload persistence verification.


Production baseline in the `Точки` tab: four cards were present. Runtime and DOM agreed on visibility `[false, false, false, true]`; the points badge was `1/4`, solo state was `null`, and the map contained 58 point markers, matching the only visible `BR&IPSE` layer. Cards were collapsed by default. This confirms current visibility synchronization before reload.


The full production reload returned to the login shell instead of restoring the authenticated map directly. The prefilled login form was submitted again; after submission the map selector appeared, so the persistence test must continue after re-opening Com Dep. This means the first reload test cannot yet be scored as a point-state failure: the application requires a new authentication/map-selection step in this browser navigation flow.


After the second login and Com Dep selection, the production map reopened and displayed the `Локальные данные` badge. The application was functional; the post-reload point-state comparison is being taken from the runtime and DOM rather than from the transient shell text.


Post-reload production result after re-authentication and reopening Com Dep: runtime and DOM again agreed on `[false, false, false, true]`; the badge remained `1/4`, solo remained `null`, point marker count remained 58, and all cards were collapsed. The same four layer ids were restored, and the `Локальные данные` badge was present. Visibility persistence passed.


A production in-memory solo smoke passed without persistence side effects: four visible layers changed to `[true, false, false, false]` when solo was activated on the first layer; its solo button received the active state; the original `[false, false, false, true]` visibility was restored afterward. The saved snapshot has no `customPtSoloId` or previous-visibility field, so solo is intentionally a session/UI mode and is not persisted across reload, while the resulting visibility state is persisted.

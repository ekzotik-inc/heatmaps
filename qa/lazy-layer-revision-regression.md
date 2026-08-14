# Lazy Layer Revision Regression — 2026-08-14

## Symptom

A hidden layer can display the toast **«Не удалось загрузить данные слоя»** when the user enables it after the server state has been updated. The observed affected layer was `Точки с инвестициями` (`custom_1785931072257`, 6,871 records).

## Production reproduction

The open client held manifest revision `2026-08-14T05:08:40.824Z`. A read-only authenticated call to `/state/layer?map=comdep&layer=custom_1785931072257` returned valid JSON and 6,871 records, but with revision `2026-08-14T05:39:22.038Z`.

The lazy loader currently rejects any layer payload whose `_revision` is not byte-for-byte equal to `_activeStateRevision`:

```js
if (!payload || payload._app !== 'hm-layer' || payload.key !== key || payload._revision !== _activeStateRevision) {
  throw new Error('STALE_LAYER');
}
```

The same current `/state/meta?map=comdep` response reported server revision `2026-08-14T05:39:22.038Z`, proving that the layer endpoint is valid and the client manifest is stale.

## Root cause

The metadata-first cache can retain an earlier manifest revision while the server’s layer revision changes. The strict stale-revision guard then converts a valid lazy layer response into an apparent data-loading failure. This is not an authentication error and does not affect persisted data.

## Required fix

On a `STALE_LAYER` response, refresh the state manifest once, apply it without losing user-local UI state, and retry the requested layer against the new revision. Bound the retry to one attempt to avoid loops. The compact chunk path must apply the same reconciliation policy if its `_revision` differs from the active manifest.

## Test cases

1. Stale client manifest + valid small `/state/layer` response refreshes/retries and hydrates exactly 6,871 records.
2. Stale client manifest + HST compact chunk refreshes/retries without duplicate records.
3. A malformed response or a second revision mismatch still fails with a user-visible error rather than looping.
4. No state save, data mutation, or visibility change is performed by the recovery path.

---
name: state-inspect
description: Диагностика живого сервера и состояния карты — доступность, CORS, версия API, наличие роутов, содержимое состояния (слои, точки, ревизия), локальный прогон сервера с тестовыми учётками. Использовать при жалобах «не сохраняется», «не загрузились слои», «сервер недоступен», 401/403/404.
---

# Диагностика сервера и состояния

Прод: `https://hm-server-xpg0.onrender.com` (значение — `window._HM_SERVER_URL`
в `index.html`). Проверять фактами, а не догадками.

## Быстрая проверка живости

```bash
S=https://hm-server-xpg0.onrender.com
curl -s --max-time 30 "$S/health"
```

Ответ говорит главное: `storage` (postgresql/file), `api` (версия),
`authConfigured`, `writeAuthConfigured` (задан ли статический `API_KEY`).

## Задеплоен ли новый код

Роут, которого нет, отдаёт HTML-страницу Express («Cannot GET»), а
существующий под защитой — **JSON** `{"error":"Authentication required"}`.
Так отличают «сервер старый» от «нет доступа»:

```bash
curl -s -w "\n[%{http_code}]\n" "$S/photo/00000000000000000000000000000000" | head -3
curl -s -w "\n[%{http_code}]\n" "$S/nosuchroute" | head -3
```

## CORS

```bash
curl -s -i -H "Origin: https://evil.example.com" "$S/health" | grep -i "^HTTP\|allow-origin"
curl -s -i -H "Origin: https://ekzotik-inc.github.io" "$S/health" | grep -i "^HTTP\|allow-origin"
```

Чужой origin должен получить **403**. Если он получает 200 с отражённым
origin — `ALLOWED_ORIGINS` не задан, это дыра, сказать владельцу.

## Содержимое состояния карты

Нужна сессия. Читать состояние **только на чтение**; никогда не писать в прод
ради диагностики — тестовый POST однажды затёр рабочее состояние.

```bash
curl -s -c /tmp/j.txt -H 'Content-Type: application/json' \
  -d '{"username":"<логин>","password":"<пароль>"}' "$S/auth/login" -o /dev/null
curl -s -b /tmp/j.txt "$S/state/meta?map=comdep" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('savedAt:', d.get('_savedAt'))
print('heatKeys:', d.get('heatKeys'))
for k,l in (d.get('layers') or {}).items():
    print(f\"  {k}: {l.get('name')} — {(l.get('stats') or {}).get('n')} точек, visible={l.get('visible')}\")
for l in d.get('customPtLayers') or []:
    print(f\"  точки {l.get('name')}: {len(l.get('recs') or [])}\" + (' [ручной]' if l.get('manual') else ''))
"
curl -s -b /tmp/j.txt "$S/state/revision?map=comdep"
```

## Локальный прогон сервера

Для проверки новых эндпоинтов без риска для прода:

```bash
cd server && npm install --silent
node -e "
const c=require('crypto');
const N=16384,R=8,P=1,salt=c.randomBytes(16).toString('hex');
const mk=pw=>'scrypt\$'+N+'\$'+R+'\$'+P+'\$'+salt+'\$'+c.scryptSync(pw,salt,32,{N,r:R,p:P,maxmem:67108864}).toString('hex');
console.log(JSON.stringify({admin:{role:'admin',passwordHash:mk('a-pass')},kg:{role:'kg',passwordHash:mk('k-pass')}}));" > /tmp/u.json
AUTH_USERS_JSON="$(cat /tmp/u.json)" SESSION_SECRET=s3cret API_KEY=testkey PORT=3999 node server.js &
```

Дальше — логин на `http://127.0.0.1:3999/auth/login` и проверка сценариев:
владелец пишет (200), вьюер другой карты не читает чужое (403), без сессии
(401), без ключа записи (401), мусорный ввод (400/415).

После прогона: `pkill -f "node server.js"` и удалить `server/state.*.json`,
`server/photos/` — они в `.gitignore`, но в рабочей копии мешают.

## Частые причины жалоб

| Симптом | Обычная причина |
|---|---|
| «Сервер недоступен» при живом `/health` | у владельца нет ключа записи; проверить бейдж синхронизации |
| 401 на запись | два разных 401: нет `X-API-Key` или нет сессии — смотреть `error` в теле |
| 404 на новый роут | сервер не передеплоен на Render |
| «Слои не загрузились» | записи тепловых слоёв ленивые: `recs` пуст, а `stats.n` не ноль |
| Правка не доехала до других | поле не учтено в `stateFingerprint` — сохранение сочло состояние неизменным |

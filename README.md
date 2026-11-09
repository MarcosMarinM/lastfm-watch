# lastfm-watch

Bot semanal que revisa lo que has escuchado en Last.fm durante los últimos **8 días** y te avisa por **Telegram** cuando encuentra **incoherencias de nombres** respecto a tu historial anterior: artistas escritos de otra forma, títulos con distinto formato, álbumes con variantes, acreditaciones `feat.`, badges de vídeo (`Official Video`, `Audio`…), artistas repetidos en el título y typos probables.

No modifica nada en Last.fm. Solo lee y avisa.

## Lo que necesito de ti

1. **Usuario de Last.fm**: el nombre de tu perfil, por ejemplo `marcosmarinm`.
2. **API key de Last.fm**: se crea gratis en <https://www.last.fm/api/account/create>.
3. **Token del bot de Telegram**: se crea con [@BotFather](https://t.me/BotFather).
4. **Chat ID de Telegram**: el identificador de tu chat con el bot.
5. **Repo privado de GitHub**: ya está creado en <https://github.com/MarcosMarinM/lastfm-watch>. Solo faltan los cuatro secretos.
6. **Zona horaria**: `Europe/Madrid`, y sí se envía mensaje también en semanas sin incoherencias.

## Cómo funciona

Cada ejecución:

1. Descarga **todo el historial anterior** a la ventana usando `user.getRecentTracks` de Last.fm, recorriéndolo hacia atrás en páginas de 200.
2. Descarga los scrobbles de la **ventana de 8 días**.
3. Construye un índice del historial con las utilidades de normalización de `engine.js` (`artistKey`, `looseTitleKey`, `strictTitleKey`, etc.).
4. Compara cada nombre de la ventana con la forma canónica del historial y clasifica la incoherencia.
5. Envía un digest a Telegram, troceado si supera el límite de 4.096 caracteres.

Al descargar el historial completo en cada ejecución, los cambios retroactivos que hagas en Last.fm se reflejan en la siguiente revisión. No hay estado persistente ni caché que se pueda quedar obsoleto.

## Categorías que detecta

| Categoría | Ejemplo |
| --- | --- |
| Artista | `Beyonce` → `Beyoncé` |
| Artista con feat. | `Ana feat. Bob` → `Ana` |
| Posible error en el artista | `Beyoncee` → `Beyoncé` (comparte pistas) |
| Título | `levitating` → `Levitating` |
| Título con badge de vídeo | `Levitating (Official Video)` → `Levitating` |
| Título con feat. | `Song (feat. Bob)` → `Song` |
| Posible error en el título | `Levitatin` → `Levitating` |
| Artista repetido en el título | `Nina - Amame` → `Amame` |
| Álbum | `future nostalgia` → `Future Nostalgia` |

Decisiones deliberadas:

- Las diferencias de mayúsculas, acentos, puntuación y espacios cuentan como incoherencia.
- Los marcadores de versión (`Live`, `Remix`, `Acoustic`, `Remastered`, etc.) **no** se marcan: normalmente son grabaciones distintas.
- Los typos se detectan de forma conservadora: misma inicial, distancia de edición pequeña y, si es posible, mismo álbum. Aun así, un título nuevo puede parecerse a uno antiguo; el mensaje lo marca como “posible”.
- Solo se compara lo que aparece en la ventana contra el historial. Una variante antigua que ya no scrobbleas no genera ruido.

## Configuración local

Requisitos: Node.js 20.6 o superior (probado con Node 22 en GitHub Actions y Node 26 en local).

```bash
cp .env.example .env
# rellena .env con tus datos
npm test
npm run dry-run
```

`npm run dry-run` carga `.env` y muestra por consola los mensajes que se enviarían, sin contactar con Telegram. El `.env.example` trae `DRY_RUN=1` a propósito.

Para enviar de verdad desde local:

```bash
DRY_RUN=0 node --env-file=.env src/run.js
```

O cambia `DRY_RUN=0` en `.env` y ejecuta `npm run dry-run`.

### Variables de entorno

| Variable | Obligatoria | Default | Uso |
| --- | --- | --- | --- |
| `LASTFM_API_KEY` | Sí | — | API key de Last.fm |
| `LASTFM_USERNAME` | Sí | — | Usuario de Last.fm |
| `TELEGRAM_BOT_TOKEN` | Sí (salvo dry-run) | — | Token de BotFather |
| `TELEGRAM_CHAT_ID` | Sí (salvo dry-run) | — | Chat donde enviar el digest |
| `WINDOW_DAYS` | No | `8` | Días hacia atrás que se revisan |
| `MAX_FINDINGS` | No | `25` | Máximo de hallazgos mostrados |
| `TIMEZONE` | No | `Europe/Madrid` | Zona horaria del mensaje |
| `NOTIFY_IF_CLEAN` | No | `1` | Enviar mensaje aunque no haya incoherencias |
| `DRY_RUN` | No | `0` | Imprimir el mensaje sin enviarlo |
| `LASTFM_MIN_INTERVAL_MS` | No | `250` | Pausa entre peticiones a Last.fm |
| `LASTFM_RETRIES` | No | `4` | Reintentos ante errores/rate limit |
| `HISTORY_SINCE` | No | vacío (todo) | Limitar el historial, p. ej. `2020-01-01` |
| `NOW` | No | ahora | Fecha de referencia para pruebas |

## GitHub Actions

El workflow está en `.github/workflows/weekly.yml` y se ejecuta:

- **Automáticamente** los domingos a las `08:00 UTC` (`0 8 * * 0`). En España son las 09:00 en invierno y las 10:00 en verano.
- **Manual** desde la pestaña **Actions → lastfm-watch → Run workflow**, con opción de `dry_run`.

### 1. Crear el repositorio privado

```bash
git init
git add .
git commit -m "Add weekly Last.fm name watch"
gh repo create lastfm-watch --private --source=. --remote=origin --push
```

O crea el repo vacío en GitHub y haz `git remote add origin ...` + `git push -u origin main`.

### 2. Añadir los secretos

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Secreto | Valor |
| --- | --- |
| `LASTFM_API_KEY` | La API key de Last.fm |
| `LASTFM_USERNAME` | Tu usuario de Last.fm |
| `TELEGRAM_BOT_TOKEN` | El token del bot |
| `TELEGRAM_CHAT_ID` | El chat ID |

También puedes hacerlo con `gh`:

```bash
gh secret set LASTFM_API_KEY
gh secret set LASTFM_USERNAME
gh secret set TELEGRAM_BOT_TOKEN
gh secret set TELEGRAM_CHAT_ID
```

Cada comando pide el valor de forma interactiva, así no queda en el historial del shell.

### 3. Probar

Lanza el workflow manualmente con `dry_run` activado y revisa el log. Cuando todo esté bien, lánzalo sin `dry_run` para recibir el mensaje real.

### Límite de minutos

Un repo privado en el plan gratuito tiene 2.000 minutos de Actions al mes. Esta ejecución tarda normalmente entre uno y pocos minutos (depende de cuántos scrobbles tenga tu historial), así que el límite es de sobra. La primera ejecución puede tardar algo más porque recorre todo el historial.

## Cómo obtener las credenciales

### Last.fm

1. Entra en <https://www.last.fm/api/account/create>.
2. Rellena el nombre de la aplicación, una descripción y una URL de callback cualquiera (por ejemplo `https://example.com`).
3. Copia la **API key**. No necesitas el shared secret.

### Telegram

1. Abre [@BotFather](https://t.me/BotFather), envía `/newbot` y elige nombre y usuario.
2. Copia el token que te devuelve.
3. Abre el chat con tu bot y envíale `/start` (el bot no puede iniciar la conversación).
4. Obtén el chat ID:

```bash
curl "https://api.telegram.org/bot<TU_TOKEN>/getUpdates"
```

Busca `result[0].message.chat.id`. En un chat privado es un número positivo; en un grupo es negativo (algo como `-1001234567890`).

También puedes usar [@userinfobot](https://t.me/userinfobot), pero `getUpdates` es la fuente fiable.

## Estructura del proyecto

```text
engine.js                     Motor de normalización del proyecto original (se reutilizan sus utilidades)
src/
  config.js                   Lectura y validación de variables de entorno
  lastfm.js                   Cliente de Last.fm con paginación, rate limit y reintentos
  names.js                    Normalización, badges, versiones, feat, Levenshtein
  history.js                  Índice del historial (artistas, pistas, álbumes)
  detect.js                   Comparación ventana vs historial
  format.js                   Construcción y troceado del mensaje de Telegram
  telegram.js                 Envío a Telegram
  run.js                      Orquestador
test/                         Tests con el runner nativo de Node
.github/workflows/weekly.yml  Ejecución semanal
```

## Tests

```bash
npm test
```

Sin dependencias externas. Cubren normalización, construcción del historial, detección de cada categoría, paginación y errores de Last.fm, formato/troceado del mensaje y el flujo completo con un Last.fm simulado.

## Límites y notas

- No edita Last.fm: las correcciones las haces tú desde la web o la app.
- El historial se descarga entero cada semana. Si tu biblioteca es enorme y quieres acelerar la ejecución, define `HISTORY_SINCE` (por ejemplo, `2020-01-01`). A cambio, perderás la comparación contra lo anterior a esa fecha.
- Last.fm limita las peticiones. El cliente espera 250 ms entre llamadas y reintenta con backoff ante `429`, `5xx` y errores de rate limit.
- Si el mensaje supera el límite de Telegram, se envía en varios mensajes consecutivos.
- El workflow usa la zona `Europe/Madrid` para el texto, pero el cron siempre está en UTC. Si vives en otra zona, cambia `TIMEZONE` y la expresión `cron`.
- No se guardan scrobbles ni datos personales en el repo. Los secretos viven en GitHub Actions.

## Solución de problemas

| Síntoma | Causa probable |
| --- | --- |
| `Faltan variables de entorno` | Falta un secreto o una variable en `.env` |
| `Last.fm: User not found (código 6)` | `LASTFM_USERNAME` no es correcto |
| `Telegram rechazó el mensaje: chat not found` | El chat ID no es correcto o no has enviado `/start` al bot |
| `Telegram rechazó el mensaje: Unauthorized` | El token del bot no es correcto |
| El workflow no se ejecuta solo | Actions desactivado, cron en UTC o ejecución manual necesaria |
| No llega nada | `NOTIFY_IF_CLEAN=0` y no hay incoherencias; revisa el log |

## Licencia

Privado / uso personal.

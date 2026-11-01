# Haar Audio Lab

Локальная лаборатория полного ортонормированного разложения Хаара: загрузка аудио → C++/WebAssembly DWT в Worker → маска → настоящий IDWT → прослушивание. Статическое приложение без backend, CDN и передачи аудио по сети.

Стек по обновлённому заданию: **C++20 + Emscripten**, TypeScript, Vite, Canvas, Web Audio. Rust не нужен. Установленные в ходе работы локальные Rust SDK, установщик и исходники удалены; системные пакеты не изменялись. Спецификация: [DESIGN.md](DESIGN.md), задание: [CODEX_PROMPT.md](CODEX_PROMPT.md), план: [PLAN.md](PLAN.md).

## Запуск

Требуются Node **22 LTS** (22.12+), npm, Python 3, C++20 compiler (`c++`, GCC 11+ / Clang 14+) и Emscripten **4.0.10**. Зависимости JS зафиксированы в `package-lock.json`; версия Emscripten — в `emsdk-version.txt`.

```bash
# Однократная локальная установка SDK; не меняет shell profile.
git clone --depth 1 --branch 4.0.10 https://github.com/emscripten-core/emsdk.git .tools/emsdk
.tools/emsdk/emsdk install 4.0.10
.tools/emsdk/emsdk activate 4.0.10
source .tools/emsdk/emsdk_env.sh

npm ci
npm run dev
```

Сборщик автоматически находит `.tools/emsdk/upstream/emscripten/em++`; также поддерживаются `em++` в PATH и явный `EMXX`. В этом рабочем каталоге SDK уже установлен. `npm run dev` сначала собирает WASM; после изменения C++ перезапустите dev или выполните `npm run wasm:build`.

```bash
npm run test:core     # native C++ + независимый Python-эталон
npm test             # маски, hit testing, версии запросов
npm run build        # WASM + TypeScript typecheck + Vite -> dist/
npm run typecheck    # отдельно, после первой wasm:build
npm run preview      # production preview

# Браузерные сценарии production-сборки
npx playwright install chromium
npm run test:e2e
# Либо уже установленный Chromium:
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e

# Проверка project Pages URL
BASE_PATH=/repo/ npm run build
BASE_PATH=/repo/ CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

`npm run build` не скачивает SDK и не использует Rust. Генерируемый WASM и glue игнорируются Git и воспроизводятся при сборке. В production достаточно содержимого `dist/`; открывать `index.html` через `file://` нельзя, нужен обычный статический HTTP hosting.

## Управление и математика

- Моно/стерео, без downmix. Одна маска применяется к обоим независимым каналам.
- `M=next_power_of_two(N)`, **все** `J=log2(M)` уровней; `(x0±x1)/sqrt(2)`, packed `[a_J,d_J,…,d_1]`.
- Правое symmetric reflection повторяет граничный отсчёт: `[1,2,3] → [1,2,3,3]`; `[1,2,3,4,5] → [1,2,3,4,5,5,4,3]`. После IDWT возвращаются ровно N отсчётов.
- Слайдер задаёт выключенный префикс Aⱼ, Dⱼ, …, D₁ и сбрасывает исключения. Есть ориентиры ≈80/200 Гц. Ручной выбор помечается «Выборочно».
- Метка строки переключает уровень; ячейка шириной от 8 CSS px — один коэффициент. Zoom 1–32× и ползунок позиции. Доступен ввод строки/k с клавиатуры; коэффициент должен быть виден и достаточно широк.
- Оранжевый слой обозначает выключение поверх неизменной фиолетовой карты. Мелкие области сглаживаются Canvas; чёрная сетка остаётся поверх.
- Цвет — RMS нормированных вкладов по каналам и пересекающимся коэффициентам каждого экранного bin, с логарифмической шкалой и 99-м перцентилем detail-строк. Это **не PSD и не точная карта частот**. Реакции Хаара широкие и перекрываются; ≈Гц — ориентир, а не резкий cutoff.
- Исходное и восстановленное аудио играют по очереди. На каждом запуске создаётся новый AudioBufferSourceNode. Изменение маски останавливает звук и блокирует реконструкцию до актуального ответа.
- Если peak восстановленного PCM >1, общий gain `0.999/peak` применяется ко всем каналам и показывается в dB; в остальных случаях усиления/нормализации нет.

## Архитектура

| Файл | Назначение |
| --- | --- |
| `cpp/haar.hpp`, `cpp/haar.cpp` | Независимая математика, padding, session, compact mask, RMS bins, peak guard |
| `cpp/wasm.cpp` | C ABI, владение сессией и выходными буферами, перехват C++ ошибок |
| `src/wasm/session.ts` | Emscripten glue: malloc/free в try/finally, typed arrays, обновляемые heap views |
| `src/worker/dsp.worker.ts` | Инициализация WASM, полное DWT/IDWT и renderBins; transferable результаты |
| `src/shared/protocol.ts` | Типы сообщений, session/request IDs |
| `src/main.ts` | Загрузка/ошибки, состояние UI, coalescing реконструкций и рендера |
| `src/ui/plot.ts`, `controls.ts` | Canvas, overlay, hit testing и компактная маска |
| `src/audio/player.ts` | AudioContext, playback, отмена ожидающего resume и освобождение source |
| `config.json` | Единый лимит PCM для C++ compile definition и UI |
| `scripts/build-wasm.mjs` | ES module + WASM, Vite `?url` asset pipeline |
| `.github/workflows/pages.yml` | Native/JS/browser tests, сборка и Pages deploy |

При новом файле прежний Worker уничтожается. Decode callbacks проверяют session ID. Для реконструкций допускается один запрос в работе и только последнее ожидающее состояние; устаревший результат не становится доступным для playback. Рендер имеет отдельную версию viewport. На UI передаются экранные bins, не миллионы коэффициентов. Память WASM может расти, поэтому glue не сохраняет heap views через выделения памяти.

## Лимиты и допущения

`config.json`: `maxPaddedSamples=8388608` (2²³) на канал, без уменьшения глубины DWT. Более 2²² исходных отсчётов вызывает предупреждение. Файлы >100 MiB вызывают предупреждение, >256 MiB отклоняются **до декодирования** — дополнительный предохранитель MVP. Byte size не гарантирует размер PCM; окончательная проверка выполняется после decode.

Для максимального стерео только одна копия PCM занимает 64 MiB. Оригинальный AudioBuffer, WASM coefficients/work buffers, transfer и reconstructed AudioBuffer вместе требуют нескольких сотен MiB; WASM heap ограничен 1 GiB. На мобильном устройстве выбирайте короткие файлы. Ошибки выделения/Worker показываются, но браузер/ОС может принудительно закрыть вкладку при нехватке памяти ещё во время decodeAudioData — перехват этого не гарантируется.

Кодеки зависят от браузера. decodeAudioData может пересэмплировать файл в частоту AudioContext: UI показывает **фактически анализируемую** частоту, не объявляет её исходной частотой файла. Стерео-карта объединяет каналы через RMS, аудиоканалы не смешиваются. Экспорт WAV, waveform, drag-and-drop и произвольный zoom выше 32× не входят в MVP.

## GitHub Pages

1. Поместите файлы в GitHub-репозиторий, основная ветка `main` (либо измените trigger workflow).
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Push в `main` или запуск workflow вручную. CI установит Emscripten/Node, выполнит тесты и опубликует `dist/`.
4. Workflow выбирает `/<repo>/`; для репозитория `*.github.io` — `/`. Для custom domain задайте repository variable `BASE_PATH=/`; для другого пути задайте соответствующее значение с завершающим `/`.

PR выполняет проверки без deploy. Разрешения публикации ограничены deploy-job. Для production не нужны SharedArrayBuffer, COOP/COEP, backend или собственный сервер. Реальная публикация требует доступного GitHub-репозитория и здесь не выполнялась.

## Выполненные проверки

Проверено локально 2026-11-01 (Node 22.16, Emscripten 4.0.10, системный Chromium):

- `npm ci --offline --cache .tools/npm-cache`: чистая установка из ранее загруженного кэша, успешно. Сетевая первоначальная установка также выполнена; системный npm потребовал обновлённого npm для разрешения зависимостей.
- `npm run test:core`: известные векторы, reflection, длины 1/2/3/7/8/1000/65537, случайный round-trip, Parseval, пустая/полная/частичная маска, поддержка одного коэффициента, stereo, peak guard, render bins и ошибки — успешно.
- Независимый рекурсивный Python-эталон: 5 dyadic-векторов, успешно.
- `npm test`: 4 теста, успешно.
- `npm run typecheck`: успешно (также входит в build).
- `npm run build` и `BASE_PATH=/repo/ npm run build`: успешно; dist содержит настоящий WASM (~24 kB), Worker и UI assets.
- Chromium production E2E под `/` и `/repo/`: по 4 сценария, включая upload → orange overlay → IDWT → playback → reset, быстрые смены маски/файла, corrupted file, numeric worker round-trip/stereo/silence, 30-секундное stereo с J=21 и ширину 320 px. Сетевых 404 / page errors в основном сценарии нет.
- Визуально просмотрены desktop/mobile screenshots. Runtime не загружает аудио на сервер; тесты используют синтетические WAV только как входные файлы, в самом приложении встроенного демо нет.

Не проверены Firefox, Safari, физические мобильные устройства, максимальный допустимый PCM на малой памяти, все варианты кодеков и реальный GitHub Pages deploy. В текущей папке нет доступного рабочего Git-репозитория (служебная `.git` не содержит репозитория), поэтому коммит/push не выполнялись. Браузерные тесты проверяют технический запуск playback и PCM, но не субъективное качество звука на физических динамиках.

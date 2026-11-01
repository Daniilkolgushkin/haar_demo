# Haar Audio Lab

Explore the Haar wavelet transform in your browser. Load an audio file, view its full decomposition, turn off individual coefficients or whole scales, and compare the reconstructed signal with the original.

The calculations run in a Web Worker using **C++20 compiled to WebAssembly**. The interface uses TypeScript, Canvas, and the Web Audio API. The app runs on static hosting. Audio is processed locally and is not sent to a server.

## Features

- Full orthonormal Haar DWT and signal reconstruction using the inverse transform (IDWT).
- Mono and stereo support. Each channel is processed separately with the same mask.
- A time–scale map: purple shows the original coefficients; orange marks disabled contributions.
- Controls to disable coarse scales in order, whole rows, or individual coefficients.
- Horizontal zoom up to 32×, panning, and keyboard controls.
- Playback of the original or the latest reconstructed signal, one at a time.
- Clipping protection with a shared gain adjustment for both channels.
- Builds for the site root or a subpath, including GitHub Pages.

## Using the app

The app interface is currently in Russian.

1. Select a local audio file. Support for WAV, MP3, Ogg, FLAC, and other formats depends on your browser's codecs.
2. Wait for the transform to finish. The app shows the duration, channel count, actual sample rate, and number of transform levels above the map.
3. Move the slider to disable contributions in order: `A_J`, then `D_J`, …, `D_1`. The ≈80 Hz and ≈200 Hz buttons select the nearest available scale.
4. Click a row label to toggle the whole level, or a cell to toggle one coefficient. A cell must be at least 8 CSS pixels wide. Use zoom and the position slider to reach smaller cells. You can also select a level and enter a coefficient index `k` with the controls below the map.
5. Play the original or the reconstructed audio. The reset button restores all coefficients.

Moving the slider clears individual changes. Manual changes switch the mask to custom selection mode. Changing the mask stops playback. The reconstructed audio becomes available when the latest calculation finishes.

**The map shows scales, not exact frequency bands.** Haar filters have broad, overlapping frequency responses. The approximate Hz labels do not define a sharp cutoff. The first scales of a long recording may be below the audible range.

## Local setup

The commands below use Bash on Linux or macOS. On Windows, use WSL.

Requirements:

- Node.js 22, version 22.12 or later within that release line, and npm.
- Python 3 and Git.
- The Emscripten version listed in [`emsdk-version.txt`](emsdk-version.txt), currently `4.0.10`.
- A C++20 compiler for native tests, available as `c++` or set through `CXX`.

From the root of your cloned repository, install the local SDK and dependencies:

```bash
mkdir -p .tools
EMSDK_VERSION=$(cat emsdk-version.txt)
git clone --depth 1 --branch "$EMSDK_VERSION" \
  https://github.com/emscripten-core/emsdk.git .tools/emsdk
.tools/emsdk/emsdk install "$EMSDK_VERSION"
.tools/emsdk/emsdk activate "$EMSDK_VERSION"
source .tools/emsdk/emsdk_env.sh

npm ci
npm run dev
```

Open the address printed by Vite. You only need to install the SDK once. If Emscripten is already installed, use `em++` from `PATH` or set `EMXX` to the compiler path. The build script also finds the SDK in `.tools/emsdk` automatically.

`npm run dev` builds WASM before starting the dev server. After changing C++ code, run `npm run wasm:build` or restart the dev server.

## Build

```bash
npm run build
npm run preview
```

The `build` command compiles C++ to WASM, checks TypeScript types, and builds the app into `dist/`. Install the SDK before running the build. Generated JS and WASM files are not stored in Git.

To host the app under a subpath:

```bash
BASE_PATH=/haar-audio-lab/ npm run build
BASE_PATH=/haar-audio-lab/ npm run preview
```

The path must start and end with `/`. The default is `/`. Upload **all contents of `dist/`**, including the WASM and Worker assets. Serve the app over HTTP(S); do not open it through `file://`.

## Tests

```bash
npm run test:core     # Native C++ tests and an independent Python reference
npm test             # TypeScript tests for masks, hit testing, and request versions
npm run build        # WASM, type checking, and the production build

npx playwright install chromium
npm run test:e2e      # Browser tests against the production build
```

On Linux CI, use `npx playwright install --with-deps chromium` if the browser also needs system libraries. You can use an existing Chromium installation:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

To test a subpath build:

```bash
BASE_PATH=/repo/ npm run build
BASE_PATH=/repo/ npm run test:e2e
```

The E2E tests start their own preview server on port `4173`. Keep that port free. To check types separately, run `npm run typecheck`.

Tests cover known coefficients, padding, energy preservation, round trips, masks, separate channels, and peak protection. Browser tests cover WASM loading, PCM transfer through the Worker, playback, fast mask and file changes, decode errors, 30-second stereo audio, and a 320 px viewport.

Native tests, the Python reference, TypeScript tests, and Chromium production tests have passed under both `/` and `/repo/`. Firefox, Safari, physical mobile devices, and all audio codec variants have not been tested. Automated playback checks do not replace listening through physical speakers.

## GitHub Pages

The repository includes a [build and deploy workflow](.github/workflows/pages.yml).

1. In the repository settings, open **Settings → Pages → Build and deployment** and select **GitHub Actions** as the source.
2. Push to `main`, or start the workflow manually from the Actions tab. If your default branch has a different name, update the workflow trigger.
3. Wait for the tests, build, and deploy job to finish. The workflow publishes the contents of `dist/`.

The workflow installs Node.js and Emscripten and runs native, JS, and Chromium tests. Pull requests run the checks without deploying.

The base path is set automatically: `/<repo>/` for a regular repository and `/` for a repository named `*.github.io`. To override it, add a repository variable named `BASE_PATH` under **Settings → Secrets and variables → Actions → Variables**. For an app at the root of a custom domain, set it to `/`. Configure the domain separately in GitHub Pages.

## How the transform works

For a signal with `N` samples, the app pads the right edge to `M = next_power_of_two(N)` using symmetric reflection, including the last sample. For example, `[1, 2, 3]` becomes `[1, 2, 3, 3]`.

The transform runs all `J = log2(M)` levels using the orthonormal formulas:

```text
a[k] = (x[2k] + x[2k+1]) / sqrt(2)
d[k] = (x[2k] - x[2k+1]) / sqrt(2)
```

Coefficients are stored as `[a_J, d_J, …, d_1]`. The original values stay unchanged. Before IDWT, the mask sets selected values in a working copy to zero. The result is trimmed to the original `N` samples.

The map uses the RMS of normalized contributions `|c| / sqrt(2^j)`, combined across channels and screen bins. Colors use a logarithmic scale with a reference value from the detail rows. This is not power spectral density (PSD).

If the reconstructed signal has a peak above `1`, all channels use the same gain, `0.999 / peak`. The app shows the reduction in dB. Otherwise, the gain stays unchanged.

## Project structure

| Path | Purpose |
| --- | --- |
| [`cpp/`](cpp/) | Standalone C++ core, C ABI for WASM, and native tests |
| [`src/wasm/`](src/wasm/) | TypeScript wrapper for WASM memory and typed array transfer |
| [`src/worker/`](src/worker/) | DWT, IDWT, and map data preparation in a Web Worker |
| [`src/ui/`](src/ui/) | Canvas map, masks, zoom, and hit testing |
| [`src/audio/`](src/audio/) | AudioContext and playback management |
| [`src/shared/protocol.ts`](src/shared/protocol.ts) | Message types and request IDs |
| [`src/main.ts`](src/main.ts) | File loading and interface state |
| [`scripts/`](scripts/) | WASM build and native test scripts |
| [`tests/`](tests/) | TypeScript tests, browser tests, and the Python reference |
| [`config.json`](config.json) | Shared sample limit for C++ and the interface |

Loading a new file stops the old Worker. Session and request IDs prevent old results from replacing current data. The main thread receives map data at screen resolution; the app does not create a DOM element for each coefficient. See [`DESIGN.md`](DESIGN.md) for the detailed specification in Russian.

## Limits

- **Signal length:** up to `2²³ = 8,388,608` padded samples per channel, about 190 seconds at 44.1 kHz or 175 seconds at 48 kHz. Every accepted file uses the full transform depth.
- **File size:** files over 100 MiB show a warning. Files over 256 MiB are rejected before decoding. A compressed file's size does not tell you how much PCM memory it needs.
- **Memory:** stereo audio at the sample limit needs several hundred MiB, including working copies. The WASM heap is limited to 1 GiB. Use short recordings on devices with little memory. The browser may close the tab if it runs out of memory during decoding.
- **Channels:** one or two channels are supported. Audio with more channels is rejected without automatic mixing.
- **Sample rate:** `decodeAudioData` may resample the file to the AudioContext sample rate. The interface shows the actual sample rate of the analyzed buffer.
- **Export:** saving processed audio as WAV is not yet supported.

Audio and processing results stay in browser memory. Network requests load the app's own resources.

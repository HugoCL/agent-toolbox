# Scripted recording

Run Node 22 or newer from the target project directory. The recorder resolves `playwright` or `@playwright/test` from that directory. If needed, add Playwright 1.48 or newer with the project's package manager and use its exec command to run `playwright install chromium`. Install FFmpeg with libx264 on PATH. The scripts install nothing.

## Run the example

Set `SKILL` to the absolute skill folder, then run these in separate terminals. Run the scenario from the directory that has Playwright installed.

```sh
node "$SKILL/scripts/example/server.mjs" 4173
```

```sh
OUT="$(mktemp -d)"
node "$SKILL/scripts/example/scenario.mjs" "$OUT/queue.mp4"
node "$SKILL/scripts/verify.mjs" "$OUT/queue.mp4" --width 1728 --height 1208 --strip-height 128
```

The example opens edit mode through a view transition, moves a seeded card using a native pointer drag, and checks the card reaches the Ready lane before saving.

## Record an app

Import `record` from [scripts/recorder.mjs](../scripts/recorder.mjs) in a scenario module. Pass these options.

| Option | Use |
|---|---|
| `baseUrl` and `output` | Loopback HTTP(S) app URL and an MP4 path. Write reviewer evidence outside the checkout. |
| `viewport` | CSS width and height. The default is 864×540. Output uses twice the width and twice the height plus a 128-pixel caption strip. |
| `allowedHosts` | Exact hostnames or host:port entries for browser HTTP(S) and WebSocket traffic. Defaults to the hostname and effective port of `baseUrl` (80 for HTTP, 443 for HTTPS when omitted). To use a backend on another port, list both the app and test backend as `host:port` entries. A bare hostname explicitly allows every port on that host. |
| `auth`, `prepare` | Optional async callbacks receiving `{ page, baseUrl }`. They run in that order after opening the URL and before the scenario. |
| `scenario` | Async callback receiving `{ page, baseUrl, clickOn, dragTo, zoomOn, caption, wait, startCapture }`. See the [example](../scripts/example/scenario.mjs). |

Reset saved state before every take, off camera. If seeding changes membership or permissions, seed first and check the test user's membership after signing in. Put app-specific hiding of development overlays and dismissal of unrelated notices in `prepare`. Check the local backend configuration separately. The proxy sees browser traffic, while calls from Node callbacks or the app server run in their own processes. Bind those processes to the demo backend and use environment-level egress controls if they can make external requests.

Call and await `startCapture()` after the screen is ready. `wait(ms)` uses finished-video time. Use `clickOn(locator)` or `dragTo(source, target)` so the pointer shows where the action occurred. The drag helper moves between two visible targets in the same viewport, using real mouse input. The overlay follows `dragover` during native drags and shows a ripple on press.

Use `zoomOn(locator)` when surrounding UI makes the changed area hard to see. The default is a mild 1.35×. Call `zoomOn()` to ease back out for the result. Write short captions in the language of the UI. `caption(text)` changes the caption in the strip below the app, and `caption("")` clears it. Give the viewer time to read.

The recorder uses 2× device scale because 1× looked soft after encoding. A full-resolution grab took about 75 ms in earlier runs. The scenario runs at 2.5× wall time, Chromium's CDP animation playback runs at 1/2.5 speed, and the frame timestamps are compressed for playback. JavaScript timers and server delays retain their own pace. New headless Chromium (`channel: "chromium"`) avoided a white flash on view transitions. Camera rounding can change a grab by a pixel or two, so the encoder normalizes size with `-reinit_filter 0` on the concat input. Without that setting, a previous recording lost about a second per camera move.

Treat the take as a real user pass. Native drags have exposed resize and drop bugs missed by synthetic events. Recording has also exposed a stray tooltip, a copy error, and a truncated date range. Fix issues in scope and record again.

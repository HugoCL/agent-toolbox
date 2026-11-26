# Before and after

Run the base and changed versions locally on separate ports or at separate URLs. Two checkouts work if both use the same demo fixture, route, appearance, viewport, locale, and clock. Capture the same interaction state on both sides. When data drifts anyway, flag the difference in the PR. A timestamp changing mid-wipe can look like part of the edit.

Use a vertical wipe when the same elements line up. It reveals which part changed with before and after labels on the two sides. Use side-by-side when the layout moves. A wipe can cut a row in half or imply that unrelated elements correspond.

## Run the example

Start [the example server](../scripts/example/server.mjs), set `SKILL` to the skill folder, and run from the project directory where Playwright resolves. See [scripted recording](scripted-recording.md) for dependencies.

```sh
OUT="$(mktemp -d)"
SCENES="$SKILL/scripts/example/scenes.json"
node "$SKILL/scripts/before-after/capture.mjs" "$SCENES" \
  http://127.0.0.1:4173/before http://127.0.0.1:4173/after "$OUT/pairs"
node "$SKILL/scripts/before-after/render.mjs" "$SCENES" "$OUT/pairs" "$OUT/comparison.mp4"
node "$SKILL/scripts/verify.mjs" "$OUT/comparison.mp4" --width 1728 --height 1080
```

Use an output ending in `.png` with an extra time in seconds to render a single comparison still, for example `"$OUT/wipe.png" 2`. The original 2× screenshot pairs are available in `"$OUT/pairs"`.

## Configure a capture

Copy [example/scenes.json](../scripts/example/scenes.json). Options at the top level include even output dimensions `width` and `height`, a default CSS `viewport`, optional `labels` with `before` and `after` text, `locale`, `timezoneId`, `allowedHosts` as in the recorder, and MP4 `crf` (default 15).

Each scene needs a unique lowercase `id`. Set `mode` to `wipe` or `side-by-side` and add a short `caption`. The following fields are optional.

| Field | Use |
|---|---|
| `path` | App-relative path beginning with `/`. Omit to use the two input URLs unchanged. |
| `viewport` | CSS viewport override for both sides. |
| `colorScheme` | `light` (default) or `dark`. Use separate scenes for each appearance. |
| `ready` | Selector for a visible, ready state. |
| `seconds` | Playback time, at least 2 seconds. Default 4. |

For a signed-in, focused, hovered, or scrolled state, pass a trusted JS module as the last argument to `capture.mjs`. Default-export an async function receiving `{ page, scene, side, baseUrl }`. Sign in as the seeded test user and perform the same setup on both sides. Each shot uses a fresh context. The renderer decodes matched PNGs, lays out each scene, and renders its timeline at 30 fps.

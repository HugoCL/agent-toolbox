# Verify the evidence

Run the checks on the file you will attach. Run the final take on the PR head after review fixes so the SHA matches the capture. Record the commit SHA with the media and verify again after encoding.

## MP4

Run [verify.mjs](../scripts/verify.mjs) with the expected dimensions and fps. It needs `ffmpeg`, `ffprobe`, and ImageMagick's `magick` command. It fails if the clip has the wrong codec, format, dimensions or cadence; missing faststart layout; non-increasing or gapped timestamps; or near-black or near-white frames. Pass `--strip-height 128` for the scripted recorder so an empty app frame cannot hide behind the caption strip.

```sh
node "$SKILL/scripts/verify.mjs" take.mp4 --width 1728 --height 1208 \
  --fps 30 --strip-height 128 --sheet take-contact.png
```

The reference bar was 701 frames without a timestamp gap above 40 ms. At 30 fps, expect about 33.33 ms. This verifies encoded timestamps. Check the recorder's separate source-gap report and play the actual file to spot a duplicated frame or a pause that a constant-rate encode can hide.

Open the contact sheet. The verifier samples up to eight frames and uses `magick montage ... -tile 2x4 -geometry 960x540+4+4`. Look for blank or white frames, wrong states, clipped captions, and unrelated UI. Play the transition and camera moves as well. Use a 100% crop like the one below to check text sharpness.

```sh
ffmpeg -ss 2 -i take.mp4 -frames:v 1 -vf crop=640:240:200:160 text-crop.png
```

For stills, inspect each at delivery size and check a native-pixel crop where text matters. For paired evidence, check alignment, labels, and viewport matches. Read the data-safety rules in [SKILL.md](../SKILL.md) before sharing.

## Size and optional GIF

The observed 23 to 27 second 1728-pixel-wide app takes at CRF 26 were about 1.1 MB. A 45.8 second stills-based 1080p comparison at CRF 15 was 12.5 MB. Treat these as examples, since motion and detail change the result.

MP4 was enough for the reference recordings. Only for a destination without video playback, use the [GIF helper](../scripts/to-gif.mjs). It generates a palette from the scaled frames with `palettegen=stats_mode=diff`, then uses `paletteuse=dither=sierra2_4a`. Start with 5 MiB or the destination's smaller budget.

```sh
node "$SKILL/scripts/to-gif.mjs" take.mp4 take.gif --width 640 --fps 12 --max-mib 5
```

If over budget, shorten the clip or reduce the width or fps. Open the GIF at its delivery size and check the captions and state changes.

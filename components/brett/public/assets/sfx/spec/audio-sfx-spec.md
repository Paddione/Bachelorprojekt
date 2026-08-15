# Audio Spec · Asset Pack 02

Cannot author binary .ogg files inline. The catalog renders this spec; sourcing
is up to the implementer. All targets: **OGG Vorbis, mono, 44.1 kHz, -14 LUFS**.

## Chat & Messaging
| File | Duration | Tonality | Freesound tags |
|------|----------|----------|----------------|
| message-receive.ogg | 220 ms | Soft bubble-pop / wooden tonal drop, low presence | `bubble pop ui notification soft` |
| message-send.ogg    | 180 ms | Paper-flick / brush swoosh, airy | `paper swipe whoosh ui send` |

## Brett Collaboration
| File | Duration | Tonality | Freesound tags |
|------|----------|----------|----------------|
| user-join.ogg     | 320 ms  | Single wood tap, warm decay | `wood knock soft tap warm` |
| piece-place.ogg   | 200 ms  | Wood-on-wood click, very dry, no reverb | `wood click chess piece place` |
| bell-gong.ogg     | 4-6 s   | Tibetan bell or singing bowl, long sustain | `tibetan bell gong meditation` |

## Monitoring Alerts (Admin Portal)
| File | Duration | Tonality | Freesound tags |
|------|----------|----------|----------------|
| node-degraded.ogg     | 600 ms | Low descending two-tone ping, -minor third | `alert ui warning low descending` |
| reconcile-success.ogg | 350 ms | Brief upward 2-note chime, clean sine | `success chime ui ascending two notes` |

## Arena Server (terrain coordinate audio)
| File | Duration | Tonality | Freesound tags |
|------|----------|----------|----------------|
| footstep-grass.ogg | 180 ms | Soft brush, organic crunch | `footstep grass soft single` |
| footstep-mud.ogg   | 220 ms | Wet squelch, low frequency | `footstep mud wet squelch` |

## Sourcing
- **Freesound.org** — CC0 / CC-BY tags only.
- **Sonniss GameAudio GDC Bundle** — yearly free royalty-free pack.
- Normalize loudness to -14 LUFS, dither to 16-bit, encode `oggenc -q 4`.

## Integration (Howler.js)
```js
const sfx = {
  msgRecv: new Howl({ src: ['/sfx/message-receive.ogg'], volume: 0.35 }),
  msgSend: new Howl({ src: ['/sfx/message-send.ogg'], volume: 0.4 }),
  gong:    new Howl({ src: ['/sfx/bell-gong.ogg'], volume: 0.55, sprite: { ring: [0, 5800] } }),
};
```

Coordinate-audio mapping (arena): `PositionalAudio` w/ refDistance 6, rolloffFactor 1.8.

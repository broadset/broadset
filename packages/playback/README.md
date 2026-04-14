# @broadset/playback

Timeline playback engine and transport controls for Broadset animation preview.

## Responsibilities

- Resolve animation timelines over time.
- Provide playback controller APIs (play, pause, seek, stop, timeline seek).
- Coordinate runtime playback state used by renderer and demo shell.

## Usage

```ts
import { createPlaybackController } from '@broadset/playback';

const controller = createPlaybackController();
controller.play();
```

## Notes

- Package boundary: may import only `@broadset/model`.

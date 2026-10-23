# FrameTrail Player Events

Every initialized FrameTrail instance exposes a pub/sub event API. This is the integration point for analytics, LMS wrappers, and host-page logic: FrameTrail core only *emits* events — collecting, aggregating, or forwarding them is the host page's (or hosting platform's) concern.

## Subscribing

```js
var instance = FrameTrail.init({ /* init options */ });

// Generic form
instance.on('play', function (evt) { console.log('started playing'); });
instance.off('play', handler);

// Convenience registrars
instance.onReady(handler);
instance.onPlay(handler);
instance.onPause(handler);
instance.onEnded(handler);
instance.onTimeupdate(handler);
instance.onSeeking(handler);
instance.onSeeked(handler);
instance.onUserAction(handler);
instance.onOverlayClick(handler);
instance.onQuizAnswered(handler);
instance.onQuizDecided(handler);
instance.onAnnotationOpened(handler);
```

Handlers can also be passed directly as init options — handy when you never keep a reference to the instance:

```js
FrameTrail.init({
    // ...
    events: {
        onPlay: function () { /* ... */ },
        onQuizAnswered: function (evt) { sendToAnalytics(evt.detail); }
    }
});
```

Keys may be written as `onPlay` or `play` — both forms are accepted.

## Event reference

Events are dispatched as `CustomEvent`s; payload fields are on `evt.detail`.

| Event | When | Payload (`evt.detail`) |
|---|---|---|
| `ready` | Player finished initializing | `{}` |
| `play` / `pause` / `ended` | Playback state changes | `{}` |
| `timeupdate` | Playback position changed | `{}` (read `instance.currentTime`) |
| `seeking` / `seeked` | Scrubbing | `{}` |
| `userAction` | Editor/viewer interactions (`VideoJumpTime`, `OverlayAdd`, `OverlayChange`, …) | `{ action, ... }` (action-specific fields) |
| `overlayClick` | Viewer clicked an overlay (any type, view mode only) | `{ name, type, start, end }` |
| `quizAnswered` | Someone answered a quiz question (any question type): at the player, or on a paired phone | `{ question, questionType, answer, correct, source }` — `answer` is the answer's text (a list of texts for multiSelect), the rating or the text; `correct` is `null` where nothing is marked correct (and for freeText, rating); `source` is `'player'` or `'phone'`. On the player only: phones' answers arrive there |
| `quizDecided` | A quiz was decided: everyone answered, its time ran out, or (a vote while playing) it ended | `{ question, questionType, answer, index, reason, correct, counts, votes, voters, action }` — `index` / `answer` the decided answer (multipleChoice), `reason` `majority`, `tieDefault`, `tieFirst`, `noneDefault`, `noneFirst`, `answered`, `none` or `empty`, `counts` per answer (per step for rating), `votes` how many answered of `voters`, `action` what follows (`''` continue, `pause`, `openUrl`, `jumpToTime`, `jumpToHypervideo`). Nothing is stored: listen here to keep results |
| `annotationOpened` | Viewer opened an annotation's detail view | `{ name, type, start, end, creator }` |

### `userAction` action names

The full set of `evt.detail.action` values dispatched by FrameTrail:

`UserLogin`, `UserLogout`, `VideoJumpTime`, `AnnotationOpen`, `AnnotationAdd`, `AnnotationChange`, `AnnotationDelete`, `OverlayAdd`, `OverlayChange`, `OverlayDelete`, `EditStart`, `EditSave`, `EditEnd`

These are also the options offered for `config.userTracesStartAction` / `config.userTracesEndAction` in the administration dialog. Two caveats if you compare action names against stored traces:

- `VideoPlay` and `VideoPause` appear in traces but are **not** `userAction` events — UserTraces derives them from the separate `play` / `pause` events, so a `userAction` listener never sees them.
- `VideoJumpForward` / `VideoJumpBackward` and `AnnotationChangeText` / `AnnotationChangeTime` likewise appear only in traces. UserTraces narrows `VideoJumpTime` and `AnnotationChange` into them *after* dispatch, so listeners always receive the broader name.

## Related APIs

- `instance.traces` — per-user session traces (see UserTraces module); capture must be enabled via `config.captureUserTraces`.
- `instance.overlays`, `instance.annotations`, `instance.subtitles`, `instance.codeSnippets` — read access to the current model.
- `instance.play()`, `instance.pause()`, `instance.currentTime`, `instance.duration` — playback control.

## Example: minimal analytics forwarding

```js
FrameTrail.init({
    // ...
    events: {
        onPlay:            function ()   { track('video_play'); },
        onEnded:           function ()   { track('video_ended'); },
        onOverlayClick:    function (e)  { track('overlay_click', e.detail); },
        onQuizAnswered:    function (e)  { track('quiz_answered', e.detail); },
        onAnnotationOpened: function (e) { track('annotation_opened', e.detail); }
    }
});

function track(name, data) {
    navigator.sendBeacon('/analytics', JSON.stringify({ name: name, data: data, t: Date.now() }));
}
```

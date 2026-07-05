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
| `quizAnswered` | Viewer answered a quiz question (any question type) | `{ question, questionType, answer, correct }` — `correct` is `null` for non-scored types (freeText, rating) |
| `annotationOpened` | Viewer opened an annotation's detail view | `{ name, type, start, end, creator }` |

## Related APIs

- `instance.traces` — per-user session traces (see UserTraces module); capture must be enabled via `config.captureUserActions`.
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

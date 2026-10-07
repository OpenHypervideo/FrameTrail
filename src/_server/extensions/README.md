# Server extensions

Drop-in folder for the server part of extensions: code that is not part of FrameTrail and adds actions and routes to its PHP backend without changing any of its files. FrameTrail releases ship this folder empty.

An extension `<name>` lives in `<name>/extension.php` here, which returns what it offers, and is switched on by its entry in `_data/config.json` → `extensions` (the same entry that loads its browser part). See [docs/EXTENDING.md](../../../docs/EXTENDING.md#server-extensions) and the example in `examples/extension-hello/server/`.

The files are not part of FrameTrail: copy them again after replacing the code with a new release.

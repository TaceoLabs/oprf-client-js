---
'@taceo/oprf-client': patch
---

`initSessions` now returns as soon as `threshold` nodes of the same epoch have answered, like the Rust client, instead of waiting for every service; a single unresponsive node no longer blocks `distributedOprf`. Sessions that are not used (still pending, duplicate party, or after a failed threshold) are closed.

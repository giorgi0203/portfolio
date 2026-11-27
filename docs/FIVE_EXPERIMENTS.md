# Five experiments for giorgi.app

| Feature | User flow | Acceptance check |
| --- | --- | --- |
| Angular row tracking | Type a draft, predict which task keeps it, and reorder the same tasks in two real Angular views. | The lab compares DOM identity for index and ID tracking. Keyboard controls work alongside dragging. |
| Angular Render Replay | Interact with a lesson, scrub its recent events and renders, and open the source for a recorded change. | The selected snapshot stays anchored and scrubbing preserves live application state. |
| Stream Doctor | Select a playback stall to inspect buffer depth, segment requests, rendition and download timing. | A controlled delayed fragment produces a real stall. The player explains missing evidence on native playback. |
| Split the Supra | Review a receipt or enter items manually, invite diners with a QR code, and claim individual or shared dishes. | Independent diners see the same table. Amounts reconcile in integer tetri and authenticated scans share the existing quota. |
| Same Frame | Choose an old photo, align the camera or import a new photo, then compare and export. | Slider and GIF work locally. A denied camera permission still allows the complete upload flow. |

Ship the lab through its independent release. Build the remaining apps in CI, verify their browser flows, then activate the affected releases on the droplet. Publish the portfolio links after the new hosts respond over HTTPS.

The new hosts are `same-frame.giorgi.app` and `split-supra.giorgi.app`. The comparison files contain the two photos and can be shared by their owner. Receipt room links admit guests to a shared bill. AI scanning is optional.

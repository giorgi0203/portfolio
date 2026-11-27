# Exploring a binding in the Angular Learning Lab

Open the Signals lesson and hover over **Count**. The editor highlights its template range and the compiler selects the emitted interpolation. Click **Add one**, then return to Count to see the current signal value, rendered text, and last observed DOM change. The workspace navigation keeps that selection when moving between panels on a phone.

Select a generated call to highlight its original source and rendered element. Read the argument labels, follow the internal steps, or open the implementation in the lab's Angular version. Related calls show how Angular creates and updates the same block. An element inside a loop can have multiple live instances. A hidden conditional block can have none.

The seven built-in starter programs ship with real AOT output generated at build time. **Run & compile** runs an edited program in the isolated browser preview and sends its source to the compiler. **Run preview** runs it locally. Shared programs wait for the reader to choose an action. Edits mark existing results stale and suspend cross-panel links until their source matches again.

The compiler returns source map segments alongside emitted files. The explorer uses mapped call boundaries when available. Older output can show a labeled approximate match if there is a unique candidate. Helpers without a reliable range can still be explored. Raw view, copy, and download preserve the emitted code.

The preview uses parsed template ranges, actual element instances, Angular render callbacks, browser events, and DOM observations. Per-instruction explanations describe the static AOT program. The separately running preview supplies evidence of rendered changes and component state.

## Release and verification

The Learning Lab workflow builds the UI and compiler, runs the unit tests and a Chromium test with real AOT output, then packages both for the Angular host. After activation it checks the public desktop and mobile flows, seven lessons, guest saves, and sharing. A failed smoke test or public browser check restores the preceding Lab release.

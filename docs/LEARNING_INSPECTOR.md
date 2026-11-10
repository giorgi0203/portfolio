# Learning Lab compiler and preview inspector

Make the real compiler a primary workspace panel, with readable annotations for creation/update instructions and selection-driven explanations. Keep raw emitted output available. Match generated instructions to source only when supported, marking approximate or unavailable matches clearly.

Instrument the browser-only preview from parsed Angular template ASTs and TypeScript literal locations. Original editor source and server AOT input stay unmodified. Hover, keyboard focus and pinning identify the template/component block and show bounded rendered values/context. Read values without evaluating handlers. Display the last event and actual DOM mutations; this is an educational rendering trace, not a CPU debugger.

Preserve the opaque sandbox, channel/run checks, one-shot initialization, explicit Run for imported code and account isolation. Retain lesson challenges, local/private saves, portable sharing and mobile use. Test loops, child components, edited source/stale output, repeated tags, events, mappings, keyboard/touch pinning and existing flows.

Deploy using the dedicated `learning-lab-deploy.yml` pipeline. It downloads an immutable checksum-pinned browser build, switches only the compiler host's static root, and preserves the existing account/AOT proxies and ACME/TLS settings. Rollback restores the previous Nginx configuration and symlink. Existing services and data are not restarted. The old initial bulk-product rollout must not be used to overwrite the independently managed Lab.

Local validation: 24 unit/privacy/parser/mapping checks passed. The real-browser inspector suite uses one actual AOT compile and validates hover without handler execution, pin/live values and event activity, source highlighting, raw/annotated output, approximate links, stale source/results, repeated and nested contexts, child input values, escaped literals, unmapped templates, source-to-preview focus and mobile layout. Existing five-lesson save/share flows are verified again during the public rollout.

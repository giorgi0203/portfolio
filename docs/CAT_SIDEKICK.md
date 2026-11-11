# The illustrated cat (parked)

The animated sidekick is currently removed from the page. Its implementation is retained for a possible return; it is not mounted and does not run. The cat in the static portrait remains.

The optional component provides one layered, illustrated tabby-and-white cat, modeled after the cat in Giorgi’s portrait. GSAP (pinned in package.json) animates its head, ears, eyes, jaw, paws and segmented tail. The original SVG stays local; no animation CDN, tracking event, or image service is involved.

The cat lives in the document beside the portrait or inside a project preview. Scrolling moves it out of view with its home; it does not follow the viewport. Deliberately hovering over another project invites it to that card. Transfers between visible homes use a short hop; transfers from an offscreen home use a brief fade so it never flies across the full page.

Nearby controls let visitors pet it, play with it, let it nap, or pause/resume. The pause choice stays in this browser. Idle behaviors include blinking, breathing, ear flicks, grooming, yawning, stretching and sleep. Reduced-motion settings show a still character; touch visits use explicit controls rather than cursor chasing.

Animation work runs outside Angular change detection. Timelines pause when the cat’s home is offscreen or the document is hidden. The component cleans up its listeners, observers and GSAP context when destroyed. The cat and its controls step away during consent choices, sign-in, and form editing. Artwork lets pointer events pass through; activity controls remain normal keyboard-accessible buttons.

Validation:

```sh
NX_DAEMON=false npx nx run-many -t lint,test,build -p portfolio --parallel=2 --watch=false
node scripts/cat-sidekick-browser.cjs
node scripts/seo-analytics-browser.cjs
```

When the sidekick is enabled, its browser checks exercise the production bundle with local fixtures and intercept external requests. They verify actual rig movement, document anchoring, project invitations, activity controls, pause persistence, reduced motion and touch layouts, without submitting messages or sending Google Analytics events. Deployment separately checks the live gallery, cat controls, consent flow, sign-in and SEO assets.

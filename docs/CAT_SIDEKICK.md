# Cartoon sidekick

The portfolio has a small black-and-white SVG cat inspired by Giorgi’s cat. It watches the pointer, crouches before occasional jumps, and perches on the visible project cards. After inactivity it rests and sleeps. The artwork is decorative and lets clicks pass through to the page. Perch selection avoids headings, filters and neighboring cards; when there is no clear place to sit, the cat steps away.

Use **Cat: pause** / **Cat: play** at the top right on desktop or below the page on phones to stop or resume its antics. The preference stays in this browser. Touch screens and reduced-motion settings use a stationary companion. The cat steps away while editing a form, using the sign-in dialog, or making an analytics consent choice.

The component owns its listeners, timers and animation frames and cleans them up when destroyed. Pointer/animation work runs outside Angular’s change detection. No new package, tracking event, or remote image service is needed.

Validation:

```sh
NX_DAEMON=false npx nx run-many -t lint,test,build -p portfolio --parallel=2 --watch=false
node scripts/cat-sidekick-browser.cjs
node scripts/seo-analytics-browser.cjs
```

The browser checks use the production bundle with local fixtures and intercept external requests. They do not submit contact messages or send Google Analytics events. Deployment separately checks the live gallery, cat control, consent flow, sign-in and SEO assets.

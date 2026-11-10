# Google Analytics and SEO setup

## Account steps

1. Sign in at https://analytics.google.com/ using the Google account that should own the reports. Create an Analytics account and GA4 property named giorgi.app. Select Tbilisi as the reporting timezone and the currency you want for reports.
2. Create a Web data stream for https://giorgi.app. **Turn Enhanced measurement off** in the stream settings: this site sends its own controlled page-view and outgoing-host events. This avoids extra automatic form/search/link data collection.
3. Copy the public measurement ID (G-...). Put it in apps/portfolio/public/analytics-config.json, rebuild, verify and deploy the portfolio. No API key, password or private token is required. Only the main portfolio loads this tag; subdomains continue using the existing private aggregate dashboard.
4. Visit the site and allow Google Analytics. Check GA Realtime. If testing with DebugView, explicitly enable debug mode for your test browser; ordinary visitors should not have debug mode enabled. Browser privacy protections and denied consent can legitimately prevent visits appearing.
5. Keep Google signals/advertising features off, review property data retention (the default short retention is fine for this project), and restrict account/property access to the people you choose. Reports are private unless you deliberately share them. Turn off Enhanced measurement before enabling the public tag.

## Search Console

1. Open https://search.google.com/search-console and add a **Domain** property: giorgi.app (without https or a path). This covers subdomains too.
2. Google supplies a public DNS TXT value beginning google-site-verification=. Add it as TXT at @ in DigitalOcean DNS. The domain registration at domenebi.ge does not change where DNS is currently managed. The assistant can add this record when you provide that public verification value.
3. Click Verify after the record appears. Submit https://giorgi.app/sitemap.xml. This sitemap intentionally lists the main homepage only; the public apps are discoverable through ordinary HTML links. Add app-specific sitemaps/metadata as a separate follow-up, rather than listing private auth/task routes.
4. Use URL Inspection on https://giorgi.app/ → Test live URL → Request indexing. Check rendered content and canonical selection. Indexing and ranking are controlled by Google and are not immediate or guaranteed.
5. Review indexing and performance after Google has crawled the site. The older Analytics usage dashboard and Search Console answer different questions: Analytics measures consenting visits; Search Console reports search visibility/clicks.

## Site implementation

The homepage has a descriptive title, description, canonical URL, social preview tags, factual Person/WebSite structured data, a sitemap and robots file, and readable initial HTML with the same five public app links as the interactive gallery. Angular replaces that initial content after boot; this is a crawler/no-JavaScript fallback, not server-side rendering or hydration. Social cards use the existing public portrait. Private auth and account pages are not included in the sitemap.

The Google tag is disabled while measurementId is empty. Once configured it loads only after opt-in, respects Do Not Track/GPC, sends sanitized page location and outgoing hostnames, and does not send form contents or URL query/hash values in its manually configured events. Choice can be changed in the footer. Revocation disables the tag, clears its host-only cookies and reloads. GA cookies are configured for 90 days. The pre-existing cookie-free aggregate analytics remains independent.

Checks: portfolio lint/unit/build plus scripts/seo-analytics-browser.cjs. The Google script is stubbed in automated tests; verify actual GA reporting using the owner's real property after the ID is configured. No real GA data collection is claimed before that step.

# Deployment

TubeMilestones is designed for static GitHub Pages hosting. The production build uses
relative asset URLs and hash routes, so the same artifact works under the repository path
without rewrite rules.

## GitHub Pages one-time setup

After `.github/workflows/deploy-pages.yml` exists on `main`:

1. Open `https://github.com/StealthMoud/TubeMilestones/settings/pages`.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Settings > Environments > github-pages** and review any deployment protection
   rules. The workflow targets this environment.
4. Open **Settings > Actions > General** and ensure GitHub Actions are allowed for the
   repository.
5. Allow the first `Deploy GitHub Pages` workflow to complete.

The expected project site is:

```text
https://stealthmoud.github.io/TubeMilestones/
```

Selecting a Pages source is a repository-owner setting. The workflow file alone cannot
truthfully prove the setting was changed.

## OAuth repository variable

The deployment workflow passes the repository variable into Vite:

```yaml
env:
  VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}
```

Create it at **Settings > Secrets and variables > Actions > Variables > New repository
variable** with name `VITE_GOOGLE_CLIENT_ID`.

The value must be the Google OAuth **Web application client ID**. It is intentionally a
repository variable because browser client IDs are public identifiers. Never add a client
secret to a Vite build.

If the variable does not exist, deployment still succeeds. The deployed landing page
shows an explicit unconfigured message and does not fake a connection.

## Workflow

Pushes to `main` and manual dispatch trigger:

```text
checkout
  -> Node 24
  -> npm ci
  -> lint, typecheck, tests, build
  -> upload dist Pages artifact
  -> deploy through github-pages environment
```

Only `dist` is uploaded. `node_modules` and local environment files are never deployed.
The generated `dist` directory is ignored and not committed.

The deployment job uses the required `pages: write` and `id-token: write` permissions.

## Verify a deployment

1. Inspect the workflow conclusion in the Actions tab.
2. Open the environment URL emitted by the deploy job.
3. Verify the landing page, privacy page, and terms page.
4. Confirm route links use `#/journey`, `#/analytics`, and `#/settings` after connection.
5. Hard-refresh the project URL and a static legal URL.
6. Check that production does not show Demo Data.
7. If the repository variable exists, test OAuth only with an allowed origin and Google
   test user.

## Custom domain later

Do not purchase a domain as part of the application build. When the owner chooses a
domain, the recommended application host is:

```text
app.tubemilestones.com
```

High-level migration:

1. Verify the root domain in the GitHub account to reduce takeover risk.
2. In the DNS provider, add a `CNAME` record for `app` pointing to
   `stealthmoud.github.io`.
3. In repository **Settings > Pages**, enter `app.tubemilestones.com` as the custom domain.
4. Wait for GitHub's DNS check, then enable **Enforce HTTPS**.
5. Add `https://app.tubemilestones.com` to the OAuth client's authorized JavaScript
   origins.
6. Update Google OAuth homepage, privacy, and terms URLs to the custom domain.
7. Update repository documentation and any canonical links.
8. Retest connect, refresh, disconnect, and legal pages from the custom domain.

Vite's relative `base` and `HashRouter` do not need a code change for the new host.

Official references:

- [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Configuring a Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Managing a custom domain for Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

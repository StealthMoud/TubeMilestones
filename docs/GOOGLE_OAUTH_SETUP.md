# Google OAuth Setup

TubeMilestones is complete without credentials, but a project owner must perform these
Google Cloud steps before a real YouTube account can connect. The application uses the
Google Identity Services browser token model and does not use a client secret.

Console labels can evolve. The current Google Auth Platform groups the relevant settings
under Branding, Audience, Data Access, and Clients.

## 1. Create or select a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Use the project selector to create a project or select the dedicated TubeMilestones
   project.
3. Record the project ID for administration. It is not an application credential.
4. Keep production OAuth configuration in this dedicated project when practical.

## 2. Enable the required APIs

In **APIs & Services > Library**, enable both:

1. **YouTube Data API v3**
2. **YouTube Analytics API**

Do not enable write-oriented YouTube features for TubeMilestones.

## 3. Configure OAuth branding

Open **Google Auth Platform > Branding** (or **APIs & Services > OAuth consent screen** in
an older console layout).

Configure:

- App name: `TubeMilestones`
- User support email: an email address controlled by the project owner
- App logo: the final TubeMilestones logo, after branding is ready for public review
- Application homepage:
  `https://stealthmoud.github.io/TubeMilestones/`
- Privacy policy:
  `https://stealthmoud.github.io/TubeMilestones/privacy.html`
- Terms of service:
  `https://stealthmoud.github.io/TubeMilestones/terms.html`
- Developer contact email: an actively monitored owner address

The public URLs must already resolve and accurately describe the deployed application
before submitting for verification.

## 4. Configure audience and test users

For owner testing before public verification:

1. Select **External** audience unless the app is intentionally limited to one Google
   Workspace organization.
2. Keep publishing status in testing while configuration is incomplete.
3. Add each Google account that will test TubeMilestones under **Test users**.

Testing-mode restrictions are controlled by Google. Do not represent test-user access as
a public production launch.

## 5. Add exactly the required scopes

Under **Data Access**, add:

```text
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/yt-analytics.readonly
```

These scopes let the app read channel information and authorized Analytics reports. Do
not add upload, edit, comment, or general Google profile scopes unless the product changes
and goes through a new privacy and verification review.

## 6. Create the browser OAuth client

1. Open **Google Auth Platform > Clients**.
2. Select **Create client**.
3. Choose application type **Web application**.
4. Name it clearly, for example `TubeMilestones Web`.
5. Add authorized JavaScript origins from the next section.
6. Create the client and copy the client ID ending in
   `.apps.googleusercontent.com`.

TubeMilestones uses a popup token request. It does not need an OAuth client secret or a
server redirect URI. Never commit or deploy a client secret.

## 7. Authorized JavaScript origins

Add the origins you actually use.

### Local Vite development

```text
http://localhost:5173
```

If you intentionally use the numeric host, add it separately:

```text
http://127.0.0.1:5173
```

If Vite runs on another port, add that exact scheme, host, and port.

### Initial GitHub Pages deployment

```text
https://stealthmoud.github.io
```

Important: an OAuth origin is only **scheme + host + optional port**. It does not contain
the repository path. Do not enter:

```text
https://stealthmoud.github.io/TubeMilestones/
```

as an origin. The `/TubeMilestones/` path belongs in homepage and privacy URLs, not in the
authorized JavaScript origin.

### Future custom domain

For the recommended future host:

```text
https://app.tubemilestones.com
```

Add that origin before switching production traffic. Keep the GitHub Pages origin only
while it is still an intentional supported entry point.

## 8. Configure the application client ID

### Local

Create `.env.local`:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Restart Vite after changing the file.

### GitHub Pages

In the GitHub repository:

1. Open **Settings > Secrets and variables > Actions**.
2. Select the **Variables** tab.
3. Create a repository variable named `VITE_GOOGLE_CLIENT_ID`.
4. Paste the web client ID as its value.
5. Re-run the Pages workflow or push a new commit.

The client ID is configuration, not a password. A repository variable is intentional.
Do not put a client secret in either variables or secrets for this app.

If the variable is absent, the workflow still builds a valid site. The Connect button is
disabled and the landing page says OAuth is not configured.

## 9. Test the complete flow

From an authorized origin:

1. Select **Connect YouTube**.
2. Choose a configured test-user Google account.
3. Confirm the consent screen names TubeMilestones and shows only the expected read-only
   scopes.
4. Verify that the correct channel appears.
5. Verify Data API metrics and Analytics freshness.
6. Reload the tab and confirm saved data appears with a reconnect prompt for refresh.
7. Use Settings to disconnect and verify the app returns to the public landing state.
8. Confirm the app no longer appears in Google permissions after successful revocation,
   or revoke it manually from [Google Account permissions](https://myaccount.google.com/permissions).

Do not use live Google OAuth in automated CI.

## 10. Public release and verification

The YouTube scopes used by TubeMilestones may require Google's OAuth verification process
before broad public access. Google can require:

- a verified domain owned by the project owner;
- accurate homepage, privacy, and terms pages;
- consistent app branding and support contact;
- a demonstration video and explanation of why each scope is required;
- evidence that requested data is limited to the disclosed product purpose;
- completion of any additional YouTube API Services review or audit.

Do not publish the OAuth app to production and claim broad availability until Google marks
the required reviews complete. A domain owned by the project owner, such as
`app.tubemilestones.com`, will usually create a cleaner long-term branding and domain
verification boundary than a repository subpath.

Official references:

- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Configure OAuth consent](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [YouTube API Services policies](https://developers.google.com/youtube/terms/developer-policies)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

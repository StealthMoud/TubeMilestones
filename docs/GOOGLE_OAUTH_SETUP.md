# Google OAuth setup

TubeMilestones intentionally uses two Google OAuth clients. Combining them would blur
application identity with YouTube authorization and make consent harder to understand.

## Prerequisites

Before public OAuth release, choose an owned production domain, publish a real private
privacy/support address, and configure the Google OAuth support email. In one Google
Cloud project:

1. Configure the OAuth consent screen and application name.
2. Set the application homepage to the deployed canonical TubeMilestones HTTPS URL.
3. Set public privacy and terms URLs on that same owned domain.
4. Add the owned production domain and any provider domains required by the Google
   console to the OAuth authorized-domain configuration.
5. Enable **YouTube Data API v3** and **YouTube Analytics API**.
6. Add test users while the consent screen is in testing mode.

## Client A: Supabase Auth identity

Create a Web application OAuth client used only by the Supabase Google provider.

Authorized redirect URI template:

```text
https://PROJECT_REF.supabase.co/auth/v1/callback
```

Enter Client A's ID and secret in Supabase Dashboard → Authentication → Providers →
Google. Supabase Auth requests identity scopes (`openid email profile`). This client does
not authorize YouTube APIs and its values are not frontend Vite variables.

Configure Supabase Auth URL settings with the production site URL and allowed callback
paths described in [Supabase setup](SUPABASE_SETUP.md).

## Client B: server-side YouTube authorization

Create a second Web application OAuth client for the Edge Function code flow.

Authorized redirect URI template:

```text
https://PROJECT_REF.supabase.co/functions/v1/youtube-oauth-callback
```

The URI must exactly match `GOOGLE_YOUTUBE_REDIRECT_URI`. Do not add a browser callback
or GitHub Pages URI to this client. Store the values only as Supabase Edge secrets:

```text
GOOGLE_YOUTUBE_CLIENT_ID
GOOGLE_YOUTUBE_CLIENT_SECRET
GOOGLE_YOUTUBE_REDIRECT_URI
```

The server requests exactly:

```text
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/yt-analytics.readonly
```

It uses authorization-code flow with `access_type=offline`, `prompt=consent`, PKCE S256,
and a single-use state value. TubeMilestones deliberately requires Google to return a
refresh token even during reconnect. If it is missing, reconnect follows Option A: it
fails safely before channel, Vault, or connection changes, preserving the previous valid
credential/connection. The client secret and refresh token must never be placed in
GitHub variables, `.env.local`, the browser, logs, or documentation screenshots.

## Consent and verification

Present the two steps plainly in the product: “Continue with Google” creates or restores
the TubeMilestones account; “Connect YouTube” requests read-only channel access. The
consent-screen copy, homepage, privacy policy, terms, authorized domains, and product UI
must all describe the same use.

The YouTube scopes may require Google's verification process before broad production
availability. While the app is in testing, only configured test users can authorize and
Google may issue shorter-lived grants. Verification is a provider-console/manual action;
the repository cannot claim approval.

## Validation checklist

- Client A redirects only to Supabase Auth and produces a normal Supabase session.
- Client B redirects only to `youtube-oauth-callback`.
- The callback URL, client ID, and client secret all belong to Client B.
- Consent lists only the two read-only YouTube scopes.
- A denied or expired attempt returns a typed safe error to the fixed frontend callback.
- Replaying state fails; an attempt older than ten minutes fails.
- A reconnect response without a refresh token fails before any persistent mutation.
- A failed reconnect leaves an existing valid connection and credential intact.
- Google Account permissions can revoke the grant and the app then requests reconnect.

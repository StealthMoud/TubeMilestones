import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../../components/common/BrandMark';
import { Button } from '../../components/common/Button';
import { ProfileMenu } from '../../components/common/ProfileMenu';
import { isDemoModeAllowed } from '../../fixtures/demoData';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';
import { userMessageForError } from '../../services/errors';
import { ApplicationAuthPanel } from '../auth/ApplicationAuthPanel';

function JourneySignature() {
  return (
    <div
      className="landing-signature"
      aria-label="A preview of a creator milestone path"
    >
      <div className="landing-signature__topline">
        <span>Next milestone</span>
        <strong>74.2%</strong>
      </div>
      <div className="landing-signature__values">
        <div className="landing-signature__current">
          <span>Current</span>
          <strong>742</strong>
          <small>subscribers</small>
        </div>
        <div className="landing-signature__target">
          <span>Target</span>
          <strong>1,000</strong>
          <small>258 to go</small>
        </div>
      </div>
      <div className="landing-signature__rail" aria-hidden="true">
        <span style={{ width: '74.2%' }}>
          <i />
        </span>
      </div>
      <div className="landing-signature__trail" aria-hidden="true">
        <span className="is-complete">
          <Check size={13} /> 500 achieved
        </span>
        <span className="is-current">742 now</span>
        <span>1K target</span>
      </div>
    </div>
  );
}

function TrustLine() {
  return (
    <ul className="landing-trust" aria-label="TubeMilestones trust commitments">
      <li>Read-only YouTube access</li>
      <li>Secure cloud sync</li>
      <li>Encrypted historical archive</li>
      <li>Disconnect anytime</li>
    </ul>
  );
}

export function LandingPage() {
  const {
    status,
    error,
    oauthConfigured,
    authUser,
    connections,
    displayName,
    profileInitials,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    requestPasswordReset,
    addYouTubeAccount,
    signOut,
    startDemo,
  } = useTubeMilestones();
  const signedIn = Boolean(authUser);
  const connecting = status === 'AUTHORIZING' || status === 'SYNCING';
  const demoAllowed = isDemoModeAllowed();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="#/" aria-label="TubeMilestones home">
          <BrandMark size={34} />
          <span>TubeMilestones</span>
        </a>
        <div className="landing-header__actions">
          <nav aria-label="Public navigation">
            <a href="./privacy.html">Privacy</a>
            <a href="./terms.html">Terms</a>
            <a
              href="https://github.com/StealthMoud/TubeMilestones"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
          {signedIn ? (
            <ProfileMenu
              displayName={displayName}
              initials={profileInitials}
              email={authUser?.email ?? null}
              onAddYouTubeAccount={addYouTubeAccount}
              onSignOut={signOut}
              addDisabled={connecting || !oauthConfigured}
            />
          ) : null}
        </div>
      </header>

      <main className="landing-main">
        <section className={`landing-hero${signedIn ? '' : ' landing-hero--auth'}`}>
          <div className="landing-hero__copy">
            <div className="landing-intro-mark">
              <BrandMark size={48} />
              <span>
                {signedIn ? 'Step 2 of 2' : 'A calmer view of creator progress'}
              </span>
            </div>
            <h1>
              {signedIn ? (
                <>
                  Connect a <em>YouTube account.</em>
                </>
              ) : (
                <>
                  Your YouTube journey, <em>one milestone at a time.</em>
                </>
              )}
            </h1>
            <p className="landing-hero__lede">
              {signedIn
                ? 'Choose the Google account that owns the YouTube channel you want to track.'
                : "See how far you've come. Know what's next. TubeMilestones turns channel data into a personal progression path."}
            </p>

            {signedIn ? (
              <div className="landing-connection-step">
                <div className="landing-account-context">
                  <span>TubeMilestones login</span>
                  <strong>{authUser?.email ?? 'Signed-in account'}</strong>
                  <p>Your YouTube account can be a different Google account.</p>
                </div>
                <div className="landing-hero__actions">
                  <Button
                    icon={<ArrowRight size={18} aria-hidden="true" />}
                    onClick={() => void addYouTubeAccount()}
                    disabled={connecting || !oauthConfigured}
                  >
                    {connecting ? 'Opening Google…' : 'Connect YouTube account'}
                  </Button>
                  <Link className="button button--quiet" to="/settings">
                    Account settings
                  </Link>
                  {demoAllowed ? (
                    <Button variant="quiet" onClick={() => startDemo('small')}>
                      Explore demo
                    </Button>
                  ) : null}
                </div>
                <p className="landing-connected-count">
                  Already connected accounts: <strong>{connections.length}</strong>
                </p>
              </div>
            ) : null}

            {signedIn ? (
              <div className="landing-permission-note">
                <LockKeyhole size={17} aria-hidden="true" />
                <p>
                  <strong>Read-only access.</strong> TubeMilestones cannot edit, upload,
                  or delete YouTube content.
                </p>
              </div>
            ) : null}

            {!oauthConfigured ? (
              <div className="landing-notice" role="status">
                <strong>Cloud connection is not configured for this deployment.</strong>
                <span>
                  Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable
                  sign-in.
                </span>
              </div>
            ) : null}
            {status === 'COMPLIANCE_HOLD' ? (
              <div className="landing-notice landing-notice--error" role="alert">
                <strong>Saved YouTube data is unavailable.</strong>
                <span>
                  Authorization could not be verified within the required window.
                </span>
              </div>
            ) : null}
            {error ? (
              <div className="landing-notice landing-notice--error" role="alert">
                <strong>{userMessageForError(error)}</strong>
              </div>
            ) : null}
            {signedIn ? <TrustLine /> : null}
          </div>
          {signedIn ? (
            <JourneySignature />
          ) : (
            <div className="landing-hero__auth-column">
              <ApplicationAuthPanel
                configured={oauthConfigured}
                signInWithGoogle={signInWithGoogle}
                signInWithPassword={signInWithPassword}
                signUpWithPassword={signUpWithPassword}
                requestPasswordReset={requestPasswordReset}
              />
              <TrustLine />
              <JourneySignature />
            </div>
          )}
        </section>
      </main>

      <footer className="landing-footer">
        <p>
          Independent from YouTube and Google. Built around read-only access and honest
          milestone history.
        </p>
        <div>
          <a href="./privacy.html">Privacy</a>
          <a href="./terms.html">Terms</a>
        </div>
      </footer>
    </div>
  );
}

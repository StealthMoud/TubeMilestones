import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../../components/common/BrandMark';
import { Button } from '../../components/common/Button';
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
      <div className="landing-signature__target">
        <strong>1,000</strong>
        <span>subscribers</span>
      </div>
      <div className="landing-signature__current">
        <strong>742</strong>
        <span>258 to go</span>
      </div>
      <svg viewBox="0 0 620 130" preserveAspectRatio="none" aria-hidden="true">
        <path d="M18 92C136 92 171 37 294 37C418 37 451 90 602 58" />
        <path
          className="is-progress"
          d="M18 92C136 92 171 37 294 37C418 37 451 90 602 58"
          pathLength="1"
        />
        <circle cx="18" cy="92" r="6" />
        <circle className="is-current" cx="294" cy="37" r="9" />
        <circle className="is-future" cx="602" cy="58" r="7" />
      </svg>
      <ol className="landing-signature__trail" aria-hidden="true">
        <li className="is-complete">
          <Check size={13} /> 500
        </li>
        <li className="is-current">1K</li>
        <li>2.5K</li>
      </ol>
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
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    requestPasswordReset,
    addYouTubeAccount,
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
                  Connect your <em>YouTube account.</em>
                </>
              ) : (
                <>
                  Your YouTube journey, <em>one milestone at a time.</em>
                </>
              )}
            </h1>
            <p className="landing-hero__lede">
              {signedIn
                ? 'You’re signed in. Connect a YouTube account to choose a channel and begin tracking. Your YouTube account can be different from the account you use to sign in.'
                : "See how far you've come. Know what's next. TubeMilestones turns channel data into a personal progression path."}
            </p>

            {signedIn ? (
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

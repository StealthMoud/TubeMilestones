import { ArrowRight, BarChart3, LockKeyhole, Route, Target } from 'lucide-react';
import { useApp } from '../../app/AppProvider';
import { userMessageForError } from '../../services/errors';
import { BrandMark } from '../../components/common/BrandMark';
import { Button } from '../../components/common/Button';
import { isDemoModeAllowed } from '../../fixtures/demoData';

function LandingJourneyVisual() {
  return (
    <div className="landing-journey" aria-label="Milestone journey preview">
      <div className="landing-journey__header">
        <span>Journey preview</span>
        <strong>Checkpoint by checkpoint</strong>
      </div>
      <div className="landing-path" aria-hidden="true">
        <span className="landing-path__line" />
        <span className="landing-path__item is-complete">
          <i />
          <span>
            <small>Started</small>
            Foundation
          </span>
        </span>
        <span className="landing-path__item is-complete">
          <i />
          <span>
            <small>Achieved</small>
            Momentum
          </span>
        </span>
        <span className="landing-path__item is-current">
          <i />
          <span>
            <small>Next</small>
            Your checkpoint
          </span>
        </span>
        <span className="landing-path__item">
          <i />
          <span>
            <small>Beyond</small>
            The next chapter
          </span>
        </span>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { status, error, oauthConfigured, hasStaleCache, connect, startDemo } =
    useApp();
  const isBusy = status === 'AUTHORIZING' || status === 'SYNCING';
  const demoAllowed = isDemoModeAllowed();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="#/" aria-label="TubeMilestones Home">
          <BrandMark size={38} />
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

      <main>
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <p className="eyebrow">A milestone-first creator companion</p>
            <h1>Your YouTube journey, one milestone at a time.</h1>
            <p className="landing-hero__lede">
              Track subscribers, views, watch time and meaningful checkpoints using your
              real YouTube channel data.
            </p>
            <div className="landing-hero__actions">
              <Button
                icon={<ArrowRight size={19} strokeWidth={1.9} />}
                onClick={() => void connect()}
                disabled={isBusy || !oauthConfigured}
              >
                {isBusy ? 'Connecting...' : 'Connect YouTube'}
              </Button>
              {demoAllowed ? (
                <Button variant="secondary" onClick={() => startDemo('small')}>
                  Explore demo
                </Button>
              ) : null}
            </div>
            <div className="landing-trust" aria-label="Connection promises">
              <span>Read-only access</span>
              <span>Local-first</span>
              <span>No TubeMilestones server</span>
            </div>

            {!oauthConfigured ? (
              <div className="landing-notice" role="alert">
                <strong>Google OAuth is not configured for this deployment.</strong>
                <span>
                  Add VITE_GOOGLE_CLIENT_ID to connect a real YouTube account.
                </span>
              </div>
            ) : null}
            {hasStaleCache ? (
              <div className="landing-notice" role="alert">
                <strong>Reconnect YouTube to access your saved channel history.</strong>
                <span>
                  Authorization has not been verified within the last 30 days.
                </span>
              </div>
            ) : null}
            {error ? (
              <div className="landing-notice landing-notice--error" role="alert">
                <strong>{userMessageForError(error)}</strong>
                {status === 'NO_CHANNEL' ? (
                  <Button variant="secondary" onClick={() => void connect()}>
                    Choose another Google account
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <LandingJourneyVisual />
        </section>

        <section className="landing-feature-story" aria-labelledby="landing-features">
          <div className="landing-feature-story__intro">
            <h2 id="landing-features">
              Know where you stand, without the studio noise.
            </h2>
            <p>
              TubeMilestones turns authorized channel statistics into a personal
              progression view. It never uploads, edits or deletes YouTube content.
            </p>
          </div>
          <div className="landing-feature-grid">
            <article className="landing-feature landing-feature--wide">
              <Target size={24} strokeWidth={1.7} aria-hidden="true" />
              <h3>Milestones with honest history</h3>
              <p>
                Existing achievements are marked as before tracking. Future crossings
                are recorded when TubeMilestones first observes them.
              </p>
            </article>
            <article className="landing-feature landing-feature--path">
              <Route size={24} strokeWidth={1.7} aria-hidden="true" />
              <h3>Your journey</h3>
              <p>A focused trail from completed checkpoints to what comes next.</p>
            </article>
            <article className="landing-feature landing-feature--analytics">
              <BarChart3 size={24} strokeWidth={1.7} aria-hidden="true" />
              <h3>Useful Analytics</h3>
              <p>Views, subscribers and Analytics watch time with clear freshness.</p>
            </article>
            <article className="landing-feature landing-feature--privacy">
              <LockKeyhole size={24} strokeWidth={1.7} aria-hidden="true" />
              <h3>Private by architecture</h3>
              <p>
                Google data moves directly to this browser. History stays in local
                IndexedDB, and access tokens stay only in live memory.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-privacy-flow" aria-labelledby="privacy-flow-title">
          <div>
            <h2 id="privacy-flow-title">Your data does not detour through us.</h2>
            <p>
              TubeMilestones has no application backend. Disconnecting removes the
              authorized channel history stored on this device.
            </p>
            <a href="./privacy.html">
              Read the privacy policy <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <ol aria-label="TubeMilestones data flow">
            <li>Google and YouTube</li>
            <li>Your browser session</li>
            <li>Local IndexedDB history</li>
          </ol>
        </section>
      </main>

      <footer className="landing-footer">
        <BrandMark size={30} />
        <p>
          TubeMilestones is an independent application and is not affiliated with or
          endorsed by YouTube or Google.
        </p>
        <div>
          <a href="./privacy.html">Privacy</a>
          <a href="./terms.html">Terms</a>
          <a
            href="https://github.com/StealthMoud/TubeMilestones"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

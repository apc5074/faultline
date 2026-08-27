import { HomeHelp } from "@/features/home/HomeHelp";
import { PlayLevelLink } from "@/features/home/PlayLevelLink";
import { LeaderboardHud } from "@/features/leaderboards/LeaderboardHud";

export default function Home() {
  return (
    <main className="home-page">
      <section className="home-page__landing" aria-labelledby="home-page-title">
        <nav className="home-page__nav" aria-label="Primary navigation">
          <span className="home-page__wordmark">Faultline</span>
          <HomeHelp />
        </nav>

        <section className="home-page__hero">
          <p className="home-page__eyebrow">Daily distributed-systems design game</p>
          <h1 id="home-page-title">Faultline</h1>
          <p className="home-page__description">
            Design the system. Run the simulation. Find the fault line.
          </p>
          <PlayLevelLink className="home-page__play">
            Play Level 1 <span aria-hidden="true">→</span>
          </PlayLevelLink>
        </section>

        <footer className="home-page__footer">
          <span>Find me on</span>
          <a className="home-page__social" href="https://github.com/apc5074" target="_blank" rel="noreferrer" aria-label="GitHub profile">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.2-3.37-1.2-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.74 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.94c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.43.2 2.48.1 2.74.64.72 1.03 1.63 1.03 2.75 0 3.94-2.35 4.81-4.58 5.06.36.32.68.93.68 1.88 0 1.36-.01 2.45-.01 2.79 0 .27.18.59.69.49A10.24 10.24 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" fill="currentColor" />
            </svg>
          </a>
          <a className="home-page__social" href="https://x.com/devAidan0" target="_blank" rel="noreferrer" aria-label="X profile">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.9 2h3.68l-8.04 9.19L24 22h-7.41l-5.8-7.59L4.15 22H.47l8.6-9.83L0 2h7.6l5.24 6.93L18.9 2Zm-1.29 18h2.04L6.49 3.9H4.3L17.61 20Z" fill="currentColor" />
            </svg>
          </a>
        </footer>
        <a className="home-page__scroll-cue" href="#today-leaderboard">
          Today&apos;s leaderboard <span aria-hidden="true">↓</span>
        </a>
      </section>

      <section id="today-leaderboard" className="home-page__leaderboard" aria-labelledby="today-leaderboard-title">
        <div className="home-page__leaderboard-content">
          <p className="home-page__eyebrow">Current challenge</p>
          <h2 id="today-leaderboard-title">Today&apos;s leaderboard</h2>
          <p className="home-page__leaderboard-description">Verified solves for today&apos;s active challenge.</p>
          <LeaderboardHud maxEntries={5} />
          <a className="home-page__back" href="#home-page-title">
            <span aria-hidden="true">↑</span> Back to home
          </a>
        </div>
      </section>
    </main>
  );
}

import { HomeHelp } from "@/features/home/HomeHelp";

export default function Home() {
  return (
    <main className="home-page">
      <nav className="home-page__nav" aria-label="Primary navigation">
        <span className="home-page__wordmark">Faultline</span>
        <HomeHelp />
      </nav>

      <section className="home-page__hero" aria-labelledby="home-page-title">
        <p className="home-page__eyebrow">Daily distributed-systems design game</p>
        <h1 id="home-page-title">Faultline</h1>
        <p className="home-page__description">
          Design the system. Run the simulation. Find the fault line.
        </p>
        <a className="home-page__play" href="/level/1">
          Play Level 1 <span aria-hidden="true">→</span>
        </a>
      </section>

      <footer className="home-page__footer">
        <span>Find me on</span>
        <a href="https://github.com/apc5074" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href="https://x.com/devAidan0" target="_blank" rel="noreferrer">
          Twitter
        </a>
      </footer>
    </main>
  );
}

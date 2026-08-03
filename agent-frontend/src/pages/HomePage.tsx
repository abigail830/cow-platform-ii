import { useAppOutletContext } from '../layouts/AppLayout.tsx';

export function HomePage() {
  const { user } = useAppOutletContext();
  const greeting = user.displayName ?? user.email;

  return (
    <div className="home-page">
      <article className="home-hero home-glass">
        <section className="home-copy" aria-label="Welcome">
          <div className="home-copy-head">
            <p className="home-eyebrow">Welcome back</p>
            <h1 className="home-title">
              Agent Platform <span className="home-title-accent">II</span>
            </h1>
            <p className="home-greeting">{greeting}</p>
          </div>
          <blockquote className="home-lead">
            The real value isn&apos;t in the model alone — it&apos;s in the continuous feedback loop of
            human guidance and real-world data.
          </blockquote>
        </section>

        <section className="home-illustration-wrap" aria-label="Platform overview">
          <img
            className="home-illustration"
            src="/2.png"
            alt="Human-centered AI development workflow"
            width={960}
            height={540}
          />
        </section>
      </article>
    </div>
  );
}

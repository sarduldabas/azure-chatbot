import { useCallback, useEffect, useState } from "react";
import Chat from "./components/Chat.jsx";
import Flow, { useFlow } from "./components/Flow.jsx";
import Facts from "./components/Facts.jsx";
import Guide from "./components/Guide.jsx";
import { SITE } from "./config.js";

function useView() {
  const read = () => (window.location.hash === "#guide" || window.location.hash.startsWith("#guide/") ? "guide" : "chat");
  const [view, setView] = useState(read);
  useEffect(() => {
    const onHash = () => setView(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return view;
}

export default function App() {
  const view = useView();
  const flow = useFlow();
  const [api, setApi] = useState({ status: "connecting", info: null });
  const [session, setSession] = useState({ conversationId: null, turns: 0, lastMs: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/info")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((info) => !cancelled && setApi({ status: info.configured ? "online" : "unconfigured", info }))
      .catch(() => !cancelled && setApi({ status: "offline", info: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = view === "guide" ? "How it was built | Foundry Chat" : "Foundry Chat";
    if (view === "chat") window.scrollTo({ top: 0 });
  }, [view]);

  const statusText = {
    connecting: "Connecting to the API",
    online: "API online",
    unconfigured: "API needs setup",
    offline: "API unreachable",
  }[api.status];

  const resetSession = useCallback(() => setSession({ conversationId: null, turns: 0, lastMs: null }), []);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="bar">
        <div className="bar__inner">
          <a className="brand" href="#" aria-label="Foundry Chat, home">
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="var(--azure)" />
              <path d="M8 21l5-10 4 6 3-4 4 8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Foundry Chat</span>
          </a>
          <nav className="tabs" aria-label="Sections">
            <a href="#" aria-current={view === "chat" ? "page" : undefined}>Chat</a>
            <a href="#guide" aria-current={view === "guide" ? "page" : undefined}>How it was built</a>
          </nav>
          <div className="bar__end">
            <span className={`status status--${api.status}`} role="status">
              <i aria-hidden="true" />
              {statusText}
            </span>
            <a className="repo" href={SITE.repo} target="_blank" rel="noreferrer">Source code</a>
          </div>
        </div>
      </header>

      <main id="main">
        {view === "chat" ? (
          <>
            <section className="hero">
              <div className="wrap">
                <h1>Ask the agent. Watch the request travel.</h1>
                <p className="hero__lede">
                  Every message here passes through four services and is answered by an agent hosted in
                  Microsoft Foundry. The path below lights up as your message moves through it.
                </p>
                <p className="hero__link"><a href="#guide">Read how it was built</a></p>
                <Flow {...flow.state} lastMs={session.lastMs} />
              </div>
            </section>
            <section className="wrap workspace">
              <Chat flow={flow} session={session} setSession={setSession} onReset={resetSession} apiStatus={api.status} />
              <Facts api={api} session={session} />
            </section>
          </>
        ) : (
          <Guide />
        )}
      </main>

      <footer className="foot">
        <div className="wrap">
          Built with React, FastAPI, Docker and Microsoft Foundry, deployed on Azure Container Apps.
        </div>
      </footer>
    </>
  );
}

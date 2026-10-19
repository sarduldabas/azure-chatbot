import { useEffect, useRef, useState } from "react";

const SUGGESTIONS = [
  "What can you help me with?",
  "Explain how you are hosted, in two sentences.",
  "Write a haiku about deploying to the cloud.",
];

export default function Chat({ flow, session, setSession, onReset, apiStatus }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const areaRef = useRef(null);
  const nextId = useRef(1);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, busy]);

  function resize() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    const add = (m) => setMessages((all) => [...all, { id: nextId.current++, ...m }]);
    add({ role: "user", text: message });
    setInput("");
    requestAnimationFrame(resize);
    setBusy(true);
    flow.begin();
    const started = performance.now();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversation_id: session.conversationId }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON error body */
      }
      if (!res.ok) throw new Error(data.detail || `The API answered with status ${res.status}.`);
      const ms = performance.now() - started;
      setSession((s) => ({ conversationId: data.conversation_id, turns: s.turns + 1, lastMs: ms }));
      flow.finish();
      add({ role: "bot", text: data.reply, ms });
    } catch (err) {
      flow.fail();
      const text =
        err instanceof TypeError
          ? "Couldn't reach the API. Check that the backend is running, then send your message again."
          : err.message;
      add({ role: "error", text });
    } finally {
      setBusy(false);
      areaRef.current?.focus();
    }
  }

  function reset() {
    setMessages([]);
    onReset();
    areaRef.current?.focus();
  }

  const empty = messages.length === 0;

  return (
    <section className="chat" aria-label="Conversation with the agent">
      <div className="chat__head">
        <h2>Conversation</h2>
        <button type="button" className="ghost" onClick={reset} disabled={empty && !session.conversationId}>
          New conversation
        </button>
      </div>

      <div className="chat__list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
        {empty && (
          <div className="chat__empty">
            <p>
              {apiStatus === "offline"
                ? "The API isn't reachable right now, so messages will fail. Start the backend or check the deployment."
                : "Try one of these, or type your own question."}
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button type="button" key={s} onClick={() => send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <article key={m.id} className={`msg msg--${m.role}`}>
            <div className="msg__body">{m.text}</div>
            {m.role === "bot" && <div className="msg__meta">Answered in {(m.ms / 1000).toFixed(1)} s</div>}
            {m.role === "error" && <div className="msg__meta">Nothing was lost. You can send it again.</div>}
          </article>
        ))}

        {busy && (
          <div className="msg msg--bot msg--typing" aria-label="The agent is replying">
            <span className="dots" aria-hidden="true"><i /><i /><i /></span>
          </div>
        )}
      </div>

      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="msg" className="sr">Message</label>
        <textarea
          id="msg"
          ref={areaRef}
          rows={1}
          value={input}
          placeholder="Message the agent"
          onChange={(e) => {
            setInput(e.target.value);
            resize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" className="send" disabled={busy || !input.trim()}>Send</button>
      </form>
      <p className="chat__hint">Enter sends, Shift+Enter adds a line. The agent remembers earlier messages in this conversation.</p>
    </section>
  );
}

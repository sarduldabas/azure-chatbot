import { useCallback, useEffect, useRef, useState } from "react";

const NODES = [
  { title: "Your browser", note: "React app" },
  { title: "Web app", note: "nginx on Container Apps" },
  { title: "API", note: "FastAPI on Container Apps" },
  { title: "Hosted agent", note: "Microsoft Foundry" },
];
const LINKS = ["HTTPS", "Private network", "Responses API"];

/** Drives the highlight sequence. The first hops are illustrative; the wait and the total time are real. */
export function useFlow() {
  const [state, setState] = useState({ step: -1, mode: "idle" });
  const timers = useRef([]);
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => clear, []);

  const begin = useCallback(() => {
    clear();
    setState({ step: 0, mode: "out" });
    later(() => setState({ step: 1, mode: "out" }), 250);
    later(() => setState({ step: 2, mode: "out" }), 700);
    later(() => setState({ step: 3, mode: "wait" }), 1200);
  }, []);

  const finish = useCallback(() => {
    clear();
    setState({ step: 3, mode: "back" });
    later(() => setState({ step: 2, mode: "back" }), 150);
    later(() => setState({ step: 1, mode: "back" }), 300);
    later(() => setState({ step: 0, mode: "back" }), 450);
    later(() => setState({ step: -1, mode: "idle" }), 2200);
  }, []);

  const fail = useCallback(() => {
    clear();
    setState((s) => ({ step: Math.max(s.step, 0), mode: "error" }));
    later(() => setState({ step: -1, mode: "idle" }), 3000);
  }, []);

  return { state, begin, finish, fail };
}

export default function Flow({ step, mode, lastMs }) {
  const nodeOn = (i) => (mode === "idle" ? false : mode === "back" ? i >= step : i <= step);
  const linkOn = (i) => (mode === "idle" ? false : mode === "back" ? i >= step : i < step);

  let caption = "The highlights are illustrative. The time shown after each reply is measured.";
  if (mode === "out") caption = "Message sent. Passing it along.";
  if (mode === "wait") caption = "The hosted agent is thinking.";
  if (mode === "back") caption = lastMs ? `Reply received in ${(lastMs / 1000).toFixed(1)} s.` : "Reply received.";
  if (mode === "error") caption = "The request failed before the agent answered.";

  return (
    <div className={`flow flow--${mode}`}>
      <ol className="flow__row" aria-label="Request path: browser, web app, API, hosted agent">
        {NODES.map((n, i) => (
          <li className="flow__item" key={n.title}>
            <div className={`node${nodeOn(i) ? " node--on" : ""}${mode === "wait" && i === step ? " node--wait" : ""}${mode === "error" && i === step ? " node--err" : ""}`}>
              <strong>{n.title}</strong>
              <span>{n.note}</span>
            </div>
            {i < LINKS.length && (
              <div className={`link${linkOn(i) ? " link--on" : ""}`} aria-hidden="true">
                <span className="link__line" />
                <span className="link__label">{LINKS[i]}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="flow__caption" aria-live="polite">{caption}</p>
    </div>
  );
}

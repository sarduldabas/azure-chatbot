import { SITE } from "../config.js";

function Row({ k, children }) {
  return (
    <div className="facts__row">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function Facts({ api, session }) {
  const info = api.info;
  const v = info?.versions || {};
  const dash = <span className="muted">Not available</span>;

  return (
    <aside className="facts" aria-label="Technical details">
      <section>
        <h2>This session</h2>
        <dl>
          <Row k="API">
            {api.status === "connecting" ? <span className="muted">Waking up, this can take a few seconds</span> : null}
            {api.status === "online" && "Online and connected to Foundry"}
            {api.status === "unconfigured" && "Running, but no agent is configured"}
            {api.status === "offline" && "Unreachable"}
          </Row>
          <Row k="Running on">{info?.runtime || dash}</Row>
          <Row k="Revision">{info?.revision ? <code>{info.revision}</code> : <span className="muted">Only set on Azure</span>}</Row>
          <Row k="Signs in with">{info?.auth || dash}</Row>
          <Row k="Messages sent">{session.turns}</Row>
          <Row k="Last reply">{session.lastMs ? `${(session.lastMs / 1000).toFixed(1)} s` : <span className="muted">No reply yet</span>}</Row>
          <Row k="Conversation">
            {session.conversationId ? <code title={session.conversationId}>{session.conversationId.slice(0, 14)}…</code> : <span className="muted">Starts with your first message</span>}
          </Row>
        </dl>
      </section>

      <section>
        <h2>The agent</h2>
        <dl>
          <Row k="Name">{info?.agent_name ? <code>{info.agent_name}</code> : dash}</Row>
          <Row k="Type">Hosted agent. Your own code, run and scaled by Foundry.</Row>
          <Row k="Model"><code>{SITE.model}</code></Row>
          <Row k="Protocol">{SITE.protocol} API, so conversation history is kept by Foundry</Row>
          <Row k="Region">{SITE.region}</Row>
          <Row k="Runtime">{SITE.agentRuntime}, {SITE.agentSize}</Row>
          <Row k="Identity">The agent has its own Microsoft Entra identity</Row>
        </dl>
      </section>

      <section>
        <h2>The API</h2>
        <dl>
          <Row k="Python"><code>{info?.python || "–"}</code></Row>
          <Row k="FastAPI"><code>{v.fastapi || "–"}</code></Row>
          <Row k="azure-ai-projects"><code>{v["azure-ai-projects"] || "–"}</code></Row>
          <Row k="azure-identity"><code>{v["azure-identity"] || "–"}</code></Row>
        </dl>
        <p className="facts__note">
          Secrets never reach this page. The API signs in to Azure itself, and the browser only ever talks to <code>/api</code>.
        </p>
      </section>
    </aside>
  );
}

import { useEffect, useState } from "react";
import {
  TOOLS, AGENT_COMMANDS, AGENT_CODE, BACKEND_CODE, NGINX_CODE, COMPOSE_CODE, ENV_CODE, LOCAL_SP,
  PROVISION_CODE, WORKFLOW_CODE, REDEPLOY_CODE, CLEANUP_CODE,
} from "./snippets.js";
import { SITE } from "../config.js";

function Code({ label, children }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard not available */
    }
  }
  return (
    <figure className="code">
      <figcaption>
        <span>{label}</span>
        <button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </figcaption>
      <pre tabIndex={0}><code>{children}</code></pre>
    </figure>
  );
}

const PARTS = [
  ["Web app (React and nginx)", "Azure Container Apps, public", "No servers to patch. Scales down to zero when nobody is using it."],
  ["API (FastAPI)", "Azure Container Apps, internal only", "Not reachable from the internet. Only the web app can call it."],
  ["Agent", "Foundry hosted agent", "Foundry builds, runs and scales it, and stores the conversations."],
  ["Container images", "Azure Container Registry", "Private image storage right next to the apps."],
  ["Sign-in between services", "Managed identity", "No passwords or keys to store, rotate or leak."],
  ["Logs", "Log Analytics, created with the Container Apps environment", "Built in. Nothing to set up."],
  ["Deployments", "GitHub Actions with OIDC", "GitHub proves who it is to Azure. No Azure password is stored in GitHub."],
];

const STEPS = [
  {
    id: "tools",
    title: "Install the tools",
    lead: "Docker builds the container images, the Azure CLI creates things in Azure, Git pushes the code, and the Azure Developer CLI (azd) deploys the Foundry agent.",
    body: (
      <>
        <Code label="PowerShell">{TOOLS}</Code>
        <p>Close and reopen the terminal after installing. Windows only refreshes the list of known programs for new windows, so a terminal that was already open will say the command isn't found.</p>
      </>
    ),
  },
  {
    id: "azure",
    title: "Sign in to Azure",
    lead: "az login signs the command line in as you. Everything you create lands in one subscription, which is the billing container, so check the active one before creating anything.",
    body: (
      <p>
        Run <code>az account show</code> and note the subscription ID. It goes into the <code>.env</code> file later.
        Creating the identities and permissions in step 9 needs the Owner role on the subscription, or Contributor plus User Access Administrator.
      </p>
    ),
  },
  {
    id: "foundry",
    title: "Create the Foundry project and a model",
    lead: "Foundry is Azure's platform for AI agents. A project is the workspace, and creating one also creates a Foundry resource behind it. Inside the project you deploy a language model for the agent to use.",
    body: (
      <ol className="plain">
        <li>Open ai.azure.com and make sure the New Foundry toggle is on.</li>
        <li>Create a project. Pick a region that supports hosted agents. This one is in {SITE.region}.</li>
        <li>Open Models, deploy a small chat model, and note its deployment name. Here it is <code>{SITE.model}</code>.</li>
        <li>Copy the project endpoint from the project's Home page. It looks like <code>https://&lt;resource&gt;.services.ai.azure.com/api/projects/&lt;project&gt;</code>.</li>
      </ol>
    ),
  },
  {
    id: "agent",
    title: "Build and deploy the hosted agent",
    lead: "A hosted agent is your own agent code that Foundry builds, runs and scales for you. A prompt agent, by comparison, is just instructions and a model filled in on a form. We chose hosted so the agent is real code that can be changed, versioned and extended with tools.",
    body: (
      <>
        <p>
          <code>azd ai agent init</code> downloads Microsoft's basic sample and links it to the existing project.{" "}
          <code>azd deploy</code> zips the source and uploads it. Foundry installs the dependencies, builds it, starts it in a
          sandbox of its own, gives it a Microsoft Entra identity, and exposes an endpoint that speaks the Responses protocol.
          Every deploy creates a new, immutable version.
        </p>
        <Code label="Run in an empty folder">{AGENT_COMMANDS}</Code>
        <p>The agent itself is short. Because it uses the Responses protocol, Foundry keeps the conversation history, so the agent stays stateless.</p>
        <Code label="Python">{AGENT_CODE}</Code>
      </>
    ),
  },
  {
    id: "api",
    title: "Write the API",
    lead: "The API is a thin layer. It receives a message from the browser, passes it to the agent, and returns the reply. It also exposes the small /api/info endpoint that fills the facts panel on the chat page.",
    body: (
      <>
        <Code label="Python, FastAPI">{BACKEND_CODE}</Code>
        <p>
          <code>DefaultAzureCredential</code> picks the right way to sign in on its own. In Azure it uses the managed identity attached to the
          container app. On your PC it uses the service principal from the <code>.env</code> file. The code is identical in both places.
        </p>
      </>
    ),
  },
  {
    id: "web",
    title: "Write the web app",
    lead: "React with Vite builds plain static files. nginx serves them and forwards anything under /api to the API.",
    body: (
      <>
        <Code label="nginx">{NGINX_CODE}</Code>
        <p>
          Forwarding from nginx means the browser only ever talks to one address, so there is no cross-origin setup. The API's address
          comes from an environment variable, so the same image works on your PC (<code>http://backend:8000</code>) and in Azure (the
          API's internal address).
        </p>
      </>
    ),
  },
  {
    id: "containers",
    title: "Containerize it and run it locally",
    lead: "Each service has a Dockerfile. Docker Compose starts both together and lets them find each other by name.",
    body: (
      <>
        <Code label="docker-compose.yml">{COMPOSE_CODE}</Code>
        <p>
          Run <code>docker compose up --build</code> and open <code>localhost:3000</code>. The health check matters: nginx looks up the
          backend's address when it starts, so the frontend waits until the backend reports healthy.
        </p>
      </>
    ),
  },
  {
    id: "secrets",
    title: "Keep credentials and URLs in one file",
    lead: "Everything environment-specific lives in a single .env file that is excluded from git. A committed .env.example shows the shape without the values.",
    body: (
      <>
        <Code label=".env">{ENV_CODE}</Code>
        <p>A container on your PC can't use your own login, so for local runs only, create a service principal with just one permission: calling Foundry.</p>
        <Code label="Azure CLI">{LOCAL_SP}</Code>
        <p>In Azure none of those three secret values are used. The API signs in with a managed identity, so there is nothing to leak. That is also why the repository can safely be public.</p>
      </>
    ),
  },
  {
    id: "infra",
    title: "Create the Azure resources",
    lead: "One script creates everything, and it can be re-run safely because it skips what already exists.",
    body: (
      <>
        <Code label="Bash, in outline">{PROVISION_CODE}</Code>
        <ul className="plain">
          <li><strong>Internal and external ingress.</strong> The API has no public address. The web app does, and it reaches the API over the private environment network.</li>
          <li><strong>Two role assignments.</strong> AcrPull lets the apps download their images. Foundry User lets the API call the agent. Nothing else is granted.</li>
          <li><strong>Scale to zero.</strong> Both apps run no replicas when idle, so the first request after a quiet period takes a few seconds longer.</li>
          <li><strong>A GitHub identity.</strong> An app registration trusts only this repository's main branch, so the pipeline needs no password.</li>
        </ul>
      </>
    ),
  },
  {
    id: "cicd",
    title: "Set up CI/CD",
    lead: "On every push to main, GitHub builds both images, pushes them to the registry, and points the two container apps at the new versions. There are no tests or checks, by design.",
    body: (
      <>
        <Code label="GitHub Actions">{WORKFLOW_CODE}</Code>
        <p>
          Add three secrets (<code>AZURE_CLIENT_ID</code>, <code>AZURE_TENANT_ID</code>, <code>AZURE_SUBSCRIPTION_ID</code>) and two variables
          (<code>AZURE_RESOURCE_GROUP</code>, <code>AZURE_ACR_NAME</code>) in the repository settings. The setup script prints all five.
          Each image is tagged with the commit ID, so every push creates a new revision and the older ones stay available for rollback.
        </p>
      </>
    ),
  },
  {
    id: "redeploy",
    title: "Change something and redeploy",
    lead: "The web app and the API redeploy themselves. The agent is deployed separately, because it lives in Foundry and not in Container Apps.",
    body: <Code label="Terminal">{REDEPLOY_CODE}</Code>,
  },
];

const PROBLEMS = [
  ["The azd command wasn't found right after installing", "Open a new terminal. A terminal that was already open doesn't see newly installed programs."],
  ["ACR Tasks requests are not permitted", "Building images inside Azure Container Registry is blocked on some new or trial subscriptions. Build with Docker on your PC or on the GitHub runner, then push the image."],
  ["Failed to parse string as JSON in Git Bash", "The Windows Azure CLI can't read Git Bash's /tmp folder. The script writes its temporary file in the project folder instead."],
  ["The role Azure AI User wasn't found", "It was renamed Foundry User. Permissions are identical, so the script tries both names."],
  ["The sample agent asked for a model that didn't exist", "The sample defaults to its own model name. Set AZURE_AI_MODEL_DEPLOYMENT_NAME to your existing deployment before azd deploy."],
  ["Git treated the agent folder as a separate repository", "azd ai agent init creates its own .git folder. Remove it before pushing, otherwise the agent's files are skipped."],
  ["The first reply is slow", "The hosted agent and both apps scale to zero. The first request wakes them, which takes around ten seconds. Later replies are quicker."],
];

export default function Guide() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const go = () => {
      const m = window.location.hash.match(/^#guide\/(.+)$/);
      if (m) document.getElementById(m[1])?.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);

  useEffect(() => {
    const ids = ["overview", ...STEPS.map((s) => s.id), "problems", "cost"];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const link = (id, text, n) => (
    <li key={id}>
      <a href={`#guide/${id}`} aria-current={active === id ? "true" : undefined}>
        {n ? <span className="toc__n">{n}</span> : <span className="toc__n" aria-hidden="true" />}
        {text}
      </a>
    </li>
  );

  return (
    <div className="wrap guide">
      <nav className="toc" aria-label="Guide sections">
        <p className="toc__title">On this page</p>
        <ol>
          {link("overview", "The big picture")}
          {STEPS.map((s, i) => link(s.id, s.title, i + 1))}
          {link("problems", "Problems we hit")}
          {link("cost", "Costs and clean-up")}
        </ol>
      </nav>

      <article className="guide__text">
        <header className="guide__intro">
          <h1>How this was built</h1>
          <p className="guide__lede">
            A React web app and a FastAPI service, both in containers on Azure, talking to an agent hosted in Microsoft Foundry,
            and redeployed automatically from GitHub. Below is every step in the order it was done, with the reasoning and the real code.
          </p>
        </header>

        <section id="overview">
          <h2>The big picture</h2>
          <p className="lead">
            You write two services and configure one. The two you write run as containers on Azure Container Apps. The agent runs inside
            Foundry itself. Wherever Azure offers a managed service, it was used instead of running anything by hand.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th scope="col">Part</th><th scope="col">Where it runs</th><th scope="col">Why that choice</th></tr>
              </thead>
              <tbody>
                {PARTS.map(([a, b, c]) => (
                  <tr key={a}><th scope="row">{a}</th><td>{b}</td><td>{c}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            A message travels from the browser to nginx, then over the private network to the API, then to the agent's Foundry endpoint,
            and the reply comes back the same way. That is the path you see lighting up on the chat page.
          </p>
        </section>

        {STEPS.map((s, i) => (
          <section id={s.id} key={s.id}>
            <h2><span className="step-n">{i + 1}</span>{s.title}</h2>
            <p className="lead">{s.lead}</p>
            {s.body}
          </section>
        ))}

        <section id="problems">
          <h2>Problems we hit</h2>
          <p className="lead">None of these were mistakes in the design, but each cost time. If you see the same message, here is the fix.</p>
          <dl className="problems">
            {PROBLEMS.map(([q, a]) => (
              <div key={q}>
                <dt>{q}</dt>
                <dd>{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="cost">
          <h2>Costs and clean-up</h2>
          <p className="lead">
            Idle compute costs almost nothing because the apps scale to zero. The container registry has a small daily charge, and the model is billed per token.
            This site is public, so every message someone sends costs a little.
          </p>
          <Code label="Remove the app, registry and identity">{CLEANUP_CODE}</Code>
          <p>
            The Foundry project sits in a different resource group and is not removed by that command. Only run <code>azd down</code> if azd created
            the project in the first place, because it deletes the resource group it provisioned.
          </p>
        </section>
      </article>
    </div>
  );
}

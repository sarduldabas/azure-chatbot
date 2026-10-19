# Azure Chatbot (React + FastAPI + Foundry agent)

```
Browser ──> frontend (React + nginx, public) ──/api──> backend (FastAPI, internal) ──> Azure AI Foundry agent
```

| Piece | Azure managed service |
|---|---|
| Containers | Azure Container Apps (+ built-in Log Analytics) |
| Images | Azure Container Registry (built with Docker, pushed by the pipeline) |
| AI | Azure AI Foundry agent (conversation history is stored by Foundry) |
| Auth to Foundry / ACR | Managed identity - no keys in Azure |
| CI/CD | GitHub Actions with OIDC login - no stored Azure password |

All credentials and URLs live in one file: **`.env`** (copy of `.env.example`, git-ignored).

## 1. Foundry agent
Use an agent you already have, or create a simple one: set `FOUNDRY_*` in `.env`, run `az login`, then
`pip install "azure-ai-projects>=2.3.0" azure-identity` and `python infra/create_agent.py`.

## 2. Run locally
The container can't use your `az login`, so give it a service principal for local use:
```
az ad sp create-for-rbac --name sp-chatbot-local --role "Azure AI User" \
  --scopes <foundry-resource-id>
```
Put `tenant`, `appId`, `password` into `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` in `.env`, then:
```
docker compose up --build        # http://localhost:3000
```

## 3. Deploy to Azure (one time)
Fill the "Azure deployment settings" in `.env`, `az login`, then `bash infra/provision.sh`
(Azure Cloud Shell, WSL or Git Bash). It prints your app URL and the 5 GitHub secrets/variables to add.

## 4. CI/CD
Push to `main` -> `.github/workflows/deploy.yml` builds both images with Docker, pushes them to ACR and updates both Container Apps. No tests or checks, by design.

## Notes
- Both apps scale to zero when idle (cheap); the first request after idle takes a few extra seconds.
- Frontend -> backend: nginx proxies `/api` to `BACKEND_URL` (`http://backend:8000` in compose, the backend's internal HTTPS URL in Azure).

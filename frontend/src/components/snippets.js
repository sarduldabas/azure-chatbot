// Code shown in the guide. Every "$" followed by "{" is escaped so JavaScript doesn't treat it as a template.

export const TOOLS = `winget install Docker.DockerDesktop
winget install Microsoft.AzureCLI
winget install Git.Git
winget install Microsoft.Azd

azd ext install microsoft.foundry
azd auth login
az login`;

export const AGENT_COMMANDS = `# 1. Scaffold the agent from Microsoft's sample, linked to your existing project
azd ai agent init -m "https://github.com/microsoft-foundry/foundry-samples/blob/main/samples/python/hosted-agents/agent-framework/responses/01-basic/azure.yaml" --deploy-mode code

# 2. Tell the agent which model deployment to use
azd env set AZURE_AI_MODEL_DEPLOYMENT_NAME gpt-5-mini

# 3. Upload the source. Foundry builds and starts it.
azd deploy

# 4. Test it from the command line
azd ai agent invoke "Say hello in one short sentence."`;

export const AGENT_CODE = `# main.py (the whole agent)
import os
from agent_framework import Agent
from agent_framework.foundry import FoundryChatClient
from agent_framework_foundry_hosting import ResponsesHostServer
from azure.identity import DefaultAzureCredential

client = FoundryChatClient(
    project_endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"],
    model=os.getenv("AZURE_AI_MODEL_DEPLOYMENT_NAME"),   # gpt-5-mini
    credential=DefaultAzureCredential(),
)

agent = Agent(
    client=client,
    instructions="You are a friendly assistant. Keep your answers brief.",
    default_options={"store": False},  # Foundry keeps the history, not the agent
)

ResponsesHostServer(agent).run()       # speaks the Responses protocol`;

export const BACKEND_CODE = `# backend/app/main.py (the important part)
credential = DefaultAzureCredential()          # managed identity on Azure, a service principal locally
project = AIProjectClient(endpoint=FOUNDRY_PROJECT_ENDPOINT, credential=credential)
client = project.get_openai_client(agent_name=FOUNDRY_AGENT_NAME)

@app.post("/api/chat")
def chat(req: ChatRequest):
    # Foundry stores the conversation, so we only send the new message.
    conversation_id = req.conversation_id or client.conversations.create().id
    response = client.responses.create(conversation=conversation_id, input=req.message)
    return {"reply": response.output_text, "conversation_id": conversation_id}`;

export const NGINX_CODE = `# frontend/nginx.conf.template
server {
    listen 80;
    root /usr/share/nginx/html;

    location /api/ {
        proxy_pass \${BACKEND_URL};          # filled in from the environment at start-up
        proxy_set_header Host $proxy_host;
        proxy_ssl_server_name on;
    }
    location / { try_files $uri /index.html; }
}`;

export const COMPOSE_CODE = `# docker-compose.yml
services:
  backend:
    build: ./backend
    environment:
      FOUNDRY_PROJECT_ENDPOINT: \${FOUNDRY_PROJECT_ENDPOINT}
      FOUNDRY_AGENT_NAME: \${FOUNDRY_AGENT_NAME}
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]

  frontend:
    build: ./frontend
    environment:
      BACKEND_URL: http://backend:8000     # the service name is the hostname
    ports: ["3000:80"]
    depends_on:
      backend: { condition: service_healthy }`;

export const ENV_CODE = `# .env  (git-ignored, never committed)
FOUNDRY_PROJECT_ENDPOINT=https://<resource>.services.ai.azure.com/api/projects/<project>
FOUNDRY_AGENT_NAME=<agent name>

# Local Docker only. In Azure these are not used, a managed identity signs in instead.
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=

# Used by the setup script
AZURE_SUBSCRIPTION_ID=
AZURE_LOCATION=westus3
AZURE_RESOURCE_GROUP=rg-chatbot
AZURE_ACR_NAME=
GITHUB_REPO=<owner>/<repo>`;

export const LOCAL_SP = `az ad sp create-for-rbac --name sp-chatbot-local --role "Foundry User" --scopes <foundry-resource-id>`;

export const PROVISION_CODE = `# infra/provision.sh, in outline
az group create -n rg-chatbot -l westus3
az acr create -n <registry> -g rg-chatbot --sku Basic
az identity create -n id-chatbot -g rg-chatbot

az role assignment create ... --role AcrPull        --scope <registry>
az role assignment create ... --role "Foundry User" --scope <foundry resource>

docker build ... && docker push ...                  # first images
az containerapp env create -n cae-chatbot -g rg-chatbot

az containerapp create -n chatbot-backend  ... --ingress internal --target-port 8000
az containerapp create -n chatbot-frontend ... --ingress external --target-port 80 \\
   --env-vars BACKEND_URL=https://<backend internal address>`;

export const WORKFLOW_CODE = `# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

permissions:
  id-token: write      # lets GitHub prove its identity to Azure, no password
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          client-id: \${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: \${{ secrets.AZURE_TENANT_ID }}
          subscription-id: \${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - run: |
          az acr login -n $ACR
          docker build -t $ACR.azurecr.io/chatbot-backend:$TAG ./backend
          docker push  $ACR.azurecr.io/chatbot-backend:$TAG
          az containerapp update -n chatbot-backend -g $RG --image $ACR.azurecr.io/chatbot-backend:$TAG`;

export const REDEPLOY_CODE = `# Changed the web app or the API
git add . && git commit -m "Describe the change" && git push

# Changed the agent (main.py or its instructions)
cd agent/agent-framework-agent-basic-responses
azd deploy`;

export const CLEANUP_CODE = `az group delete -n rg-chatbot --yes --no-wait     # the app, registry and identity`;

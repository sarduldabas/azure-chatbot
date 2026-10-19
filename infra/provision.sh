#!/usr/bin/env bash
# One-time Azure setup. Run from the repo root:   bash infra/provision.sh
# Works in Azure Cloud Shell, WSL, or Git Bash (needs: az CLI + Docker, logged in via `az login`).
# Safe to re-run: steps that already exist are skipped.
#
# Creates (all managed services, no servers and no stored passwords):
#   Resource group, Container Registry (ACR), Container Apps environment (+ logs),
#   a managed identity, the backend + frontend Container Apps,
#   and a GitHub OIDC identity so the pipeline can deploy.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # stop Git Bash on Windows from mangling "/subscriptions/..." arguments
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8   # avoids Windows console encoding crashes while az prints logs

cd "$(dirname "$0")/.."
[ -f .env ] || { echo "ERROR: .env not found. Copy .env.example to .env and fill it in."; exit 1; }
set -a; source <(tr -d '\r' < .env); set +a

for v in FOUNDRY_PROJECT_ENDPOINT FOUNDRY_AGENT_NAME AZURE_SUBSCRIPTION_ID AZURE_LOCATION \
         AZURE_RESOURCE_GROUP AZURE_ACR_NAME AZURE_CONTAINERAPPS_ENV GITHUB_REPO; do
  [ -n "${!v:-}" ] || { echo "ERROR: $v is empty in .env"; exit 1; }
done

RG=$AZURE_RESOURCE_GROUP; LOC=$AZURE_LOCATION; ACR=$AZURE_ACR_NAME; ENVNAME=$AZURE_CONTAINERAPPS_ENV
SUB=$AZURE_SUBSCRIPTION_ID; IDENTITY=id-chatbot

az account set --subscription "$SUB"
az extension add --name containerapp --upgrade -y -o none
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry; do
  az provider register --namespace $ns --wait -o none
done

echo "==> Resource group, registry, identity"
az group create -n "$RG" -l "$LOC" -o none
az acr create -n "$ACR" -g "$RG" --sku Basic -o none
ACR_ID=$(az acr show -n "$ACR" -g "$RG" --query id -o tsv)

az identity create -n $IDENTITY -g "$RG" -l "$LOC" -o none
ID_RES=$(az identity show -n $IDENTITY -g "$RG" --query id -o tsv)
ID_CLIENT=$(az identity show -n $IDENTITY -g "$RG" --query clientId -o tsv)
ID_PRINCIPAL=$(az identity show -n $IDENTITY -g "$RG" --query principalId -o tsv)

echo "==> Role assignments for the managed identity"
az role assignment create --assignee-object-id "$ID_PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role AcrPull --scope "$ACR_ID" -o none

# "Foundry User" on the Foundry resource lets the backend call agents in it.
FOUNDRY_ACCOUNT=$(echo "$FOUNDRY_PROJECT_ENDPOINT" | sed -E 's#https://([^.]+)\..*#\1#')
FOUNDRY_ID=$(az cognitiveservices account list --query "[?name=='$FOUNDRY_ACCOUNT'].id | [0]" -o tsv || true)
if [ -n "$FOUNDRY_ID" ]; then
  # The role was renamed "Foundry User" (formerly "Azure AI User"); same permissions, so try both names.
  az role assignment create --assignee-object-id "$ID_PRINCIPAL" --assignee-principal-type ServicePrincipal \
    --role "Foundry User" --scope "$FOUNDRY_ID" -o none 2>/dev/null || \
  az role assignment create --assignee-object-id "$ID_PRINCIPAL" --assignee-principal-type ServicePrincipal \
    --role "Azure AI User" --scope "$FOUNDRY_ID" -o none
else
  echo "WARNING: could not find Foundry resource '$FOUNDRY_ACCOUNT' in this subscription."
  echo "         Assign the 'Foundry User' role to identity '$IDENTITY' on it manually."
fi

echo "==> Building first images with local Docker and pushing to ACR"
# (ACR Tasks / "az acr build" is blocked on some new or trial subscriptions, so we build locally.)
az acr login -n "$ACR"
docker build --platform linux/amd64 -t "$ACR.azurecr.io/chatbot-backend:latest" ./backend
docker build --platform linux/amd64 -t "$ACR.azurecr.io/chatbot-frontend:latest" ./frontend
docker push "$ACR.azurecr.io/chatbot-backend:latest"
docker push "$ACR.azurecr.io/chatbot-frontend:latest"

echo "==> Container Apps environment + apps"
if ! az containerapp env show -n "$ENVNAME" -g "$RG" -o none 2>/dev/null; then
  az containerapp env create -n "$ENVNAME" -g "$RG" -l "$LOC" -o none
fi

# Backend: internal only (not reachable from the internet), talks to Foundry with the managed identity.
if ! az containerapp show -n chatbot-backend -g "$RG" -o none 2>/dev/null; then
  echo "    waiting 60s for role assignments to propagate"; sleep 60
  az containerapp create -n chatbot-backend -g "$RG" --environment "$ENVNAME" \
    --image "$ACR.azurecr.io/chatbot-backend:latest" \
    --user-assigned "$ID_RES" --registry-server "$ACR.azurecr.io" --registry-identity "$ID_RES" \
    --ingress internal --target-port 8000 --min-replicas 0 --max-replicas 2 \
    --env-vars FOUNDRY_PROJECT_ENDPOINT="$FOUNDRY_PROJECT_ENDPOINT" FOUNDRY_AGENT_NAME="$FOUNDRY_AGENT_NAME" \
               AZURE_CLIENT_ID="$ID_CLIENT" -o none
else
  echo "    chatbot-backend already exists - skipping"
fi
BACKEND_FQDN=$(az containerapp show -n chatbot-backend -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)

# Frontend: public; nginx forwards /api to the backend's internal URL.
if ! az containerapp show -n chatbot-frontend -g "$RG" -o none 2>/dev/null; then
  az containerapp create -n chatbot-frontend -g "$RG" --environment "$ENVNAME" \
    --image "$ACR.azurecr.io/chatbot-frontend:latest" \
    --user-assigned "$ID_RES" --registry-server "$ACR.azurecr.io" --registry-identity "$ID_RES" \
    --ingress external --target-port 80 --min-replicas 0 --max-replicas 2 \
    --env-vars BACKEND_URL="https://$BACKEND_FQDN" -o none
else
  echo "    chatbot-frontend already exists - skipping"
fi
FRONTEND_FQDN=$(az containerapp show -n chatbot-frontend -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)

echo "==> GitHub Actions identity (OIDC, no secret)"
TENANT=$(az account show --query tenantId -o tsv)
GH_APP_ID=$(az ad app list --display-name "gh-chatbot-deploy" --query "[0].appId" -o tsv)
if [ -z "$GH_APP_ID" ]; then
  GH_APP_ID=$(az ad app create --display-name "gh-chatbot-deploy" --query appId -o tsv)
  az ad sp create --id "$GH_APP_ID" -o none
  sleep 20
fi
az role assignment create --assignee "$GH_APP_ID" --role Contributor \
  --scope "/subscriptions/$SUB/resourceGroups/$RG" -o none
az role assignment create --assignee "$GH_APP_ID" --role AcrPush --scope "$ACR_ID" -o none

if [ -z "$(az ad app federated-credential list --id "$GH_APP_ID" --query "[?name=='github-main'].name" -o tsv)" ]; then
  # Written next to the script (not in /tmp): the Windows az CLI can't read Git Bash's /tmp paths.
  FED=".fed-credential.json"
  cat > "$FED" <<JSON
{"name":"github-main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:${GITHUB_REPO}:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"]}
JSON
  az ad app federated-credential create --id "$GH_APP_ID" --parameters "@$FED" -o none
  rm -f "$FED"
fi

# GitHub now puts numeric owner/repo IDs in the token subject for newer repos
# (repo:OWNER@ID/REPO@ID:...), so also trust that form. Public repos expose the IDs without a token.
if [ -z "$(az ad app federated-credential list --id "$GH_APP_ID" --query "[?name=='github-main-ids'].name" -o tsv)" ]; then
  OWNER_ID=$(curl -s "https://api.github.com/repos/${GITHUB_REPO}" | python -c "import sys,json; d=json.load(sys.stdin); print(d['owner']['id'])" 2>/dev/null || true)
  REPO_ID=$(curl -s "https://api.github.com/repos/${GITHUB_REPO}" | python -c "import sys,json; d=json.load(sys.stdin); print(d['id'])" 2>/dev/null || true)
  if [ -n "$OWNER_ID" ] && [ -n "$REPO_ID" ]; then
    FED=".fed-credential.json"
    cat > "$FED" <<JSON
{"name":"github-main-ids","issuer":"https://token.actions.githubusercontent.com","subject":"repo:${GITHUB_REPO%%/*}@${OWNER_ID}/${GITHUB_REPO##*/}@${REPO_ID}:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"]}
JSON
    az ad app federated-credential create --id "$GH_APP_ID" --parameters "@$FED" -o none
    rm -f "$FED"
  fi
fi

echo "==> Permissions held by the managed identity (expect AcrPull + a Foundry role):"
az role assignment list --assignee "$ID_PRINCIPAL" --all --query "[].{Role:roleDefinitionName, Scope:scope}" -o table

cat <<OUT

=====================================================================
 DONE.  App URL:  https://$FRONTEND_FQDN
=====================================================================
 Add these in GitHub -> $GITHUB_REPO -> Settings -> Secrets and variables -> Actions

 Secrets:
   AZURE_CLIENT_ID        = $GH_APP_ID
   AZURE_TENANT_ID        = $TENANT
   AZURE_SUBSCRIPTION_ID  = $SUB
 Variables:
   AZURE_RESOURCE_GROUP   = $RG
   AZURE_ACR_NAME         = $ACR

 Then push to main - the pipeline builds and deploys automatically.
OUT

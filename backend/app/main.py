"""Minimal chatbot backend that forwards messages to an Azure AI Foundry agent."""
import logging
import os
import platform
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

log = logging.getLogger("chatbot")
logging.basicConfig(level=logging.INFO)

FOUNDRY_PROJECT_ENDPOINT = os.getenv("FOUNDRY_PROJECT_ENDPOINT", "")
FOUNDRY_AGENT_NAME = os.getenv("FOUNDRY_AGENT_NAME", "")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.openai = None
    if FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_AGENT_NAME:
        # DefaultAzureCredential = managed identity on Azure, service principal env vars / az login locally.
        credential = DefaultAzureCredential()
        project = AIProjectClient(endpoint=FOUNDRY_PROJECT_ENDPOINT, credential=credential)
        # OpenAI-compatible client that is bound to the Foundry agent.
        app.state.openai = project.get_openai_client(agent_name=FOUNDRY_AGENT_NAME)
        log.info("Connected to Foundry agent '%s'", FOUNDRY_AGENT_NAME)
    else:
        log.warning("FOUNDRY_PROJECT_ENDPOINT / FOUNDRY_AGENT_NAME not set - /api/chat will return 503")
    yield
    if app.state.openai is not None:
        app.state.openai.close()


app = FastAPI(title="Chatbot API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str


@app.get("/health")
def health():
    return {"status": "ok"}


def _version(package: str) -> str | None:
    try:
        return version(package)
    except PackageNotFoundError:
        return None


@app.get("/api/info")
def info():
    """Non-sensitive facts about this running API, shown on the web page."""
    on_azure = bool(os.getenv("CONTAINER_APP_NAME"))  # set automatically by Azure Container Apps
    if on_azure:
        auth = "Managed identity"
    elif os.getenv("AZURE_CLIENT_SECRET"):
        auth = "Service principal"
    else:
        auth = "Developer sign-in"
    return {
        "agent_name": FOUNDRY_AGENT_NAME or None,
        "configured": app.state.openai is not None,
        "runtime": "Azure Container Apps" if on_azure else "Docker Compose (local)",
        "revision": os.getenv("CONTAINER_APP_REVISION"),
        "auth": auth,
        "python": platform.python_version(),
        "versions": {
            "fastapi": _version("fastapi"),
            "azure-ai-projects": _version("azure-ai-projects"),
            "azure-identity": _version("azure-identity"),
        },
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    client = app.state.openai
    if client is None:
        raise HTTPException(503, "Backend is not configured: set FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_AGENT_NAME.")
    try:
        # Foundry stores the conversation history, so we only send the new message.
        conversation_id = req.conversation_id or client.conversations.create().id
        response = client.responses.create(conversation=conversation_id, input=req.message)
        return ChatResponse(reply=response.output_text, conversation_id=conversation_id)
    except Exception:
        log.exception("Foundry agent call failed")
        raise HTTPException(502, "The agent call failed. Check the backend logs.")

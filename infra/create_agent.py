"""Optional: create a simple agent in your Foundry project (skip if you already have one).

Run after `az login` and filling .env:
    pip install "azure-ai-projects>=2.3.0" azure-identity
    python infra/create_agent.py
"""
import os
import pathlib

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import PromptAgentDefinition
from azure.identity import DefaultAzureCredential

# Tiny .env loader so no extra dependency is needed.
env_file = pathlib.Path(__file__).resolve().parent.parent / ".env"
for line in env_file.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

project = AIProjectClient(endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"], credential=DefaultAzureCredential())
agent = project.agents.create_version(
    agent_name=os.environ["FOUNDRY_AGENT_NAME"],
    definition=PromptAgentDefinition(
        model=os.environ["FOUNDRY_MODEL_DEPLOYMENT"],
        instructions="You are a friendly, concise assistant.",
    ),
)
print(f"Agent ready: name={agent.name} version={agent.version}")

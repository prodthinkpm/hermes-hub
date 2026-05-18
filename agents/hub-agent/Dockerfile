FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
COPY hermes_hub_agent/ hermes_hub_agent/

RUN pip install --no-cache-dir .

ENV HERMES_HUB_URL=http://hub-server:3000
ENV HERMES_NODE_ID=docker-node
ENV HERMES_HOME=/data

CMD ["hermes-hub-agent"]

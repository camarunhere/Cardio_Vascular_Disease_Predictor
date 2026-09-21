# Backend image for Render: Node.js API + Python ML service in one container.
FROM node:20-bookworm-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 MONGOMS_DISABLE_POSTINSTALL=1 NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps (the server auto-detects /app/.venv/bin/python)
COPY requirements-ml.txt ./
RUN python3 -m venv .venv && .venv/bin/pip install -r requirements-ml.txt

# Node deps
COPY server/package.json server/package-lock.json server/
RUN npm ci --omit=dev --prefix server

# Train the model at build time so the artifacts always match the installed library versions
COPY src src
COPY data/cardio_train.csv data/cardio_extended.csv data/
RUN mkdir -p models \
 && .venv/bin/python -m src.train_extended --data data/cardio_extended.csv --out models/cvd_model_extended.joblib

COPY server server

WORKDIR /app/server
EXPOSE 8000
CMD ["node", "src/index.js"]

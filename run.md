# Run EdgeFlow

## Setup (once)

```powershell
npm install
uv sync
copy .env.example .env      # then fill in DB + JWT values
npm run db:push
npm run db:migrate
```

## Dev (4 terminals)

```powershell
docker run -d --name redis -p 6379:6379 redis:alpine          # 1. Redis (later: docker start redis)
npm run dev                                                    # 2. Node + web UI
uv run main.py                                                 # 3. Python API
uv run celery -A celery_app worker --pool=solo --loglevel=info # 4. Celery
```

Open http://localhost:5000

## Production

```powershell
npm run build
npm run start                                          # Node
uv run uvicorn main:app --host 0.0.0.0 --port 7860     # Python
uv run celery -A celery_app worker --loglevel=info     # Celery
```

## Checks & tests

```powershell
npm run check          # TypeScript
npm test               # Vitest
npm run test:python    # pytest
```
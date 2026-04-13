FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        xvfb \
        pulseaudio \
        ffmpeg \
        dbus \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
        fastapi \
        "uvicorn[standard]" \
        httpx \
        playwright

RUN playwright install firefox --with-deps

WORKDIR /app
COPY app.py .

EXPOSE 8000

CMD ["sh", "-c", \
     "pulseaudio --start --exit-idle-time=-1 --log-target=stderr 2>/dev/null; \
      uvicorn app:app --host 0.0.0.0 --port 8000"]

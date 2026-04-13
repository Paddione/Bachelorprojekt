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

ENV PULSE_SERVER=unix:/tmp/pulse/native

WORKDIR /app
COPY app.py .

EXPOSE 8000

CMD ["sh", "-c", \
     "mkdir -p /tmp/pulse && \
      pulseaudio --daemonize=true --exit-idle-time=-1 --log-target=stderr \
        -n --load='module-null-sink sink_name=default_sink' \
        --load='module-native-protocol-unix auth-anonymous=1 socket=/tmp/pulse/native' 2>&1 || true; \
      sleep 1; \
      uvicorn app:app --host 0.0.0.0 --port 8000"]

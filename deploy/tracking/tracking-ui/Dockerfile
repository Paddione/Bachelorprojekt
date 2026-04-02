FROM denoland/deno:2.1.4

WORKDIR /app

# Cache dependencies
COPY deno.json .
COPY main.ts .
RUN deno cache main.ts

EXPOSE 3000

CMD ["deno", "run", "--allow-net", "--allow-env", "main.ts"]

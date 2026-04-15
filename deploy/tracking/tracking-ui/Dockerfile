FROM denoland/deno:2.3.1

WORKDIR /app
COPY deno.json .
COPY main.ts .
RUN deno cache main.ts

EXPOSE 80
ENV PORT=80

CMD ["deno", "run", "--allow-net", "--allow-env", "main.ts"]

FROM node:20-alpine

RUN npm install -g supergateway @modelcontextprotocol/server-postgres

EXPOSE 3001

# DATABASE_URL must be set at runtime (e.g. postgresql://user:pass@host:5432/dbname)
# supergateway bridges stdio → streamable-http on /mcp
CMD ["sh", "-c", "supergateway --stdio \"npx @modelcontextprotocol/server-postgres \\\"$DATABASE_URL\\\"\" --outputTransport streamableHttp --port 3001 --streamableHttpPath /mcp --healthEndpoint /health"]

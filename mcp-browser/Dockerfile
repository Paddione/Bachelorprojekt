FROM mcr.microsoft.com/playwright:v1.50.1-jammy

RUN npm install -g supergateway @modelcontextprotocol/server-playwright

EXPOSE 3000

CMD ["npx", "supergateway", \
     "--stdio", "npx @modelcontextprotocol/server-playwright", \
     "--outputTransport", "streamableHttp", \
     "--port", "3000", \
     "--streamableHttpPath", "/mcp", \
     "--healthEndpoint", "/health"]

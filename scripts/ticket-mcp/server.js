import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerListTools } from './tools/list.js';
import { registerTriageTools } from './tools/triage.js';

const server = new McpServer({
  name: 'ticket-mcp',
  version: '1.0.0',
});

registerListTools(server);
registerTriageTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

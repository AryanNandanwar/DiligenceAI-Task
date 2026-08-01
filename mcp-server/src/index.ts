import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { registerTools } from './tools.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'o2c-ops', version: '1.0.0' },
    {
      instructions:
        'Tools for e-commerce Order-to-Cash operations: diagnosing and fixing stuck orders, ' +
        'failed payments, refunds, inventory mismatches, missing shipments, and invoices. ' +
        'Typical workflow: ops_summary to see what needs attention, diagnose_order for root ' +
        'cause, then the suggested fix tool. Every fix requires a reason, which is audit-logged.',
    },
  );
  registerTools(server);
  return server;
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'o2c-mcp-server' });
});

// Stateless Streamable HTTP: a fresh server + transport per request.
app.post('/mcp', async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Stateless server: no session-based GET (SSE) or DELETE support.
const methodNotAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed' },
    id: null,
  });
};
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`O2C MCP server listening on http://0.0.0.0:${PORT}/mcp`);
  console.log(`Backend URL: ${process.env.BACKEND_URL ?? 'http://localhost:3000'}`);
});

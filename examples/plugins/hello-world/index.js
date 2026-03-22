/**
 * Hello World - Example Kagora Plugin
 *
 * Demonstrates:
 *   - Webhook endpoint registration
 *   - Chat message event subscription
 *   - Interval task scheduling
 *   - Terminal interaction
 */

let ctx;

function activate(pluginCtx) {
  ctx = pluginCtx;
  ctx.log.info('Hello World plugin activated!');

  // Register a webhook at GET /api/plugins/hello-world/status
  ctx.webhook.register('GET', 'status', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      plugin: 'hello-world',
      agents: ctx.chat.agents(),
      uptime: process.uptime()
    }));
  });

  // Register a webhook at POST /api/plugins/hello-world/broadcast
  ctx.webhook.register('POST', 'broadcast', (_req, res, body) => {
    try {
      const { message } = JSON.parse(body);
      if (!message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "message" field' }));
        return;
      }
      ctx.chat.send('hello-world', 'group', message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
    }
  });

  // Subscribe to chat messages
  ctx.events.on('chat:message', (msg) => {
    // Auto-reply to "!ping" in group chat
    if (msg.to === 'group' && msg.text === '!ping') {
      ctx.chat.send('hello-world', 'group', 'pong!');
    }
  });
}

function deactivate() {
  if (ctx) {
    ctx.log.info('Hello World plugin deactivated');
  }
}

module.exports = { activate, deactivate };

import { Hono } from 'hono';

// Stub Hono app. Real REST routes (bulk admin endpoints, MCP exposure)
// arrive in later phases — for now we only need a deployable surface.
export const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

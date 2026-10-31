// Nova's Toolkit — User Lookup Worker
// Holds a separate Discord bot token (never Wevo's) and proxies
// GET /users/:id from Discord's API so the frontend never sees a secret.
// Not yet implemented — stub for when we design this tool.

export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ error: "not implemented yet" }), {
      status: 501,
      headers: { "content-type": "application/json" },
    });
  },
};

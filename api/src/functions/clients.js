/**
 * clients.js — Client roster for the Client dropdowns.
 *
 * GET /api/clients            → { clients: [{ id, name, fyStart }] } (Production = 1)
 * GET /api/clients?source=all → { clients: ["ABC", "DEF", ...] }     (full roster)
 */

import { app } from "@azure/functions";
import { getClientList } from "../lib/queries.js";

app.http("clients", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "clients",
  handler: async (request, context) => {
    try {
      const source = request.query.get("source") || "";
      const clients = await getClientList(source);
      return { status: 200, jsonBody: { clients } };
    } catch (err) {
      context.error("Failed to fetch client list:", err);
      return {
        status: 500,
        jsonBody: { error: "Failed to fetch clients", detail: err.message },
      };
    }
  },
});

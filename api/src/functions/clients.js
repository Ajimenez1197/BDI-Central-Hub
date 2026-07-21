/**
 * clients.js — Production-client roster for the Client dropdown.
 *
 * GET /api/clients
 * Returns: { clients: [{ id, name, fyStart }] }  (Production = 1 only)
 */

import { app } from "@azure/functions";
import { getClientList } from "../lib/queries.js";

app.http("clients", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "clients",
  handler: async (request, context) => {
    try {
      const clients = await getClientList();
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

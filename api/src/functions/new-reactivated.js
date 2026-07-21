/**
 * new-reactivated.js — New & Reactivated Donors report (Digital tab).
 *
 * POST /api/new-reactivated
 * Body: { clientId, view }   view = "monthly" (default) | "fytd"
 * Returns: { status, clientId, clientName, view, rows }
 */

import { app } from "@azure/functions";
import { getProductionClient, queryNewReactivated } from "../lib/queries.js";

app.http("new-reactivated", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "new-reactivated",
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Invalid JSON body" } };
    }

    const { clientId } = body;
    const view = body.view === "fytd" ? "fytd" : "monthly";

    if (!clientId) {
      return { status: 400, jsonBody: { error: "clientId is required." } };
    }

    try {
      // Validate the client is a real, production client before querying.
      const client = await getProductionClient(clientId);
      if (!client) {
        return {
          status: 400,
          jsonBody: { error: `Unknown or non-production client: "${clientId}".` },
        };
      }

      context.log(`New/Reactivated report for ${clientId} (${view})...`);
      const rows = await queryNewReactivated(clientId, view, client.fyStart);

      return {
        status: 200,
        jsonBody: {
          status: "success",
          clientId: client.id,
          clientName: client.name,
          view,
          rows,
        },
      };
    } catch (err) {
      context.error("New/Reactivated query failed:", err);
      return { status: 500, jsonBody: { error: "Query failed", detail: err.message } };
    }
  },
});

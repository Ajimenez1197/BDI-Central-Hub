/**
 * qbr.js — Quarterly Business Report (Client Service tab).
 *
 * POST /api/qbr
 * Body: { clientId }
 * Returns: { status, clientId, clientName, data }
 *
 * `data` carries the datasets for all six report sections (see getQbrData).
 */

import { app } from "@azure/functions";
import { getProductionClient } from "../lib/queries.js";
import { getQbrData } from "../lib/qbr-queries.js";

app.http("qbr", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "qbr",
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Invalid JSON body" } };
    }

    const { clientId } = body;
    if (!clientId) {
      return { status: 400, jsonBody: { error: "clientId is required." } };
    }

    try {
      const client = await getProductionClient(clientId);
      if (!client) {
        return {
          status: 400,
          jsonBody: { error: `Unknown or non-production client: "${clientId}".` },
        };
      }

      context.log(`QBR for ${clientId}...`);
      const data = await getQbrData(client.id, client.fyStart);

      return {
        status: 200,
        jsonBody: {
          status: "success",
          clientId: client.id,
          clientName: client.name,
          data,
        },
      };
    } catch (err) {
      context.error("QBR query failed:", err);
      return { status: 500, jsonBody: { error: "Query failed", detail: err.message } };
    }
  },
});

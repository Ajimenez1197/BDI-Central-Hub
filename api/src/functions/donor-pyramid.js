/**
 * donor-pyramid.js — Donor Pyramid report (Client Service tab).
 *
 * POST /api/donor-pyramid
 * Body: { clientId, period }   period = "cy" (default) | "rolling12" | "fytd"
 * Returns: { status, clientId, clientName, period, window, client, benchmark }
 *   client/benchmark: { buckets:{mass,middle,major:{donors,revenue}}, totalDonors, totalRevenue }
 *   benchmark also carries clientCount.
 */

import { app } from "@azure/functions";
import {
  getProductionClient,
  resolveWindow,
  queryDonorPyramid,
  queryDonorPyramidBenchmark,
} from "../lib/queries.js";

const PERIODS = new Set(["cy", "rolling12", "fytd"]);

app.http("donor-pyramid", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "donor-pyramid",
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Invalid JSON body" } };
    }

    const { clientId } = body;
    const period = PERIODS.has(body.period) ? body.period : "cy";
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

      const window = resolveWindow(period, client.fyStart);
      context.log(`Donor Pyramid for ${clientId} (${period}) ${window.start}..${window.end}`);

      const [clientData, benchmark] = await Promise.all([
        queryDonorPyramid(clientId, window.start, window.end),
        queryDonorPyramidBenchmark(period, window.start, window.end),
      ]);

      return {
        status: 200,
        jsonBody: {
          status: "success",
          clientId: client.id,
          clientName: client.name,
          period,
          window,
          client: clientData,
          benchmark,
        },
      };
    } catch (err) {
      context.error("Donor Pyramid query failed:", err);
      return { status: 500, jsonBody: { error: "Query failed", detail: err.message } };
    }
  },
});

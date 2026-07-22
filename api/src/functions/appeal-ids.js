/**
 * appeal-ids.js — Returns Appeal IDs for the Blue Book appeal dropdown.
 *
 * GET /api/appeal-ids?clientId=TWC&type=backtest
 * GET /api/appeal-ids?clientId=TWC&type=test
 * GET /api/appeal-ids?clientId=TWC&type=match
 */

import { app } from "@azure/functions";
import { getAppealIds } from "../lib/queries.js";

app.http("appeal-ids", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "appeal-ids",
  handler: async (request, context) => {
    const clientId = request.query.get("clientId");
    const filterType = request.query.get("type") || "backtest";

    if (!clientId) {
      return { status: 400, jsonBody: { error: "clientId query param is required." } };
    }

    if (!["backtest", "test", "match"].includes(filterType)) {
      return { status: 400, jsonBody: { error: "type must be backtest, test, or match." } };
    }

    try {
      const appeals = await getAppealIds(clientId, filterType);
      return { status: 200, jsonBody: { clientId, type: filterType, appeals } };
    } catch (err) {
      context.error("Failed to fetch appeal IDs:", err);
      return {
        status: 500,
        jsonBody: { error: "Failed to fetch appeal IDs", detail: err.message },
      };
    }
  },
});

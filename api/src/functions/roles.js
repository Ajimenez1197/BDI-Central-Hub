/**
 * roles.js — Custom role assignment for Static Web Apps auth.
 *
 * SWA POSTs here on each login (configured via auth.rolesSource in
 * staticwebapp.config.json) with the user's claims. We return the roles to
 * assign. Every genuine tenant member gets "member"; guest / B2B accounts get
 * nothing, so the "member"-gated routes reject them.
 *
 * Guest detection uses the two canonical, false-positive-free Entra markers:
 *   - UPN / email contains "#EXT#"  (every B2B guest UPN has this)
 *   - the "acct" claim equals "1"   (0 = member, 1 = guest)
 * We deliberately do NOT key off the "idp" claim, which would also flag
 * federated employees.
 *
 * POST /api/roles  (called by the SWA platform, never the browser directly)
 */

import { app } from "@azure/functions";

app.http("roles", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "roles",
  handler: async (request, context) => {
    try {
      const body = await request.json();
      const claims = Array.isArray(body?.claims) ? body.claims : [];

      // Match a claim by exact type or by URI suffix (AAD uses long URIs).
      const claimVal = (name) =>
        claims.find((c) => c.typ === name || c.typ?.endsWith(`/${name}`))?.val || "";

      const upn = (
        claimVal("preferred_username") ||
        claimVal("upn") ||
        claimVal("emails") ||
        body?.userDetails ||
        ""
      ).toString();

      const acct = claimVal("acct"); // "1" = guest, "0" = member

      const isGuest = upn.toUpperCase().includes("#EXT#") || acct === "1";

      if (isGuest) {
        context.warn(`Denying guest account: ${upn || "(unknown)"}`);
        return { jsonBody: { roles: [] } };
      }

      return { jsonBody: { roles: ["member"] } };
    } catch (err) {
      // Fail closed: on any error, assign no roles rather than leak access.
      context.error("roles function failed, denying access:", err);
      return { jsonBody: { roles: [] } };
    }
  },
});

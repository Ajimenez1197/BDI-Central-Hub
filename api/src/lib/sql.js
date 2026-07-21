/**
 * sql.js — SQL Server connection pool with Entra ID auth.
 *
 * Authenticates with a service principal (app registration) via:
 *   AAD_TENANT_ID, AAD_CLIENT_ID, AAD_CLIENT_SECRET
 * App identities bypass MFA, so this works for both local dev and Azure.
 */

import sql from "mssql";
import { ClientSecretCredential } from "@azure/identity";

const SQL_SCOPE = "https://database.windows.net/.default";

let _pool = null;

/**
 * Get (or create) a connection pool authenticated via Entra ID.
 */
export async function getPool() {
  if (_pool?.connected) return _pool;

  const credential = new ClientSecretCredential(
    process.env.AAD_TENANT_ID,
    process.env.AAD_CLIENT_ID,
    process.env.AAD_CLIENT_SECRET
  );
  const tokenResponse = await credential.getToken(SQL_SCOPE);

  const config = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    requestTimeout: 120000,   // 2 minutes per query
    connectionTimeout: 90000, // 90s — long enough for a serverless DB to resume from auto-pause
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    authentication: {
      type: "azure-active-directory-access-token",
      options: {
        token: tokenResponse.token,
      },
    },
  };

  _pool = await sql.connect(config);
  return _pool;
}

/**
 * Close the pool (useful for graceful shutdown / testing).
 */
export async function closePool() {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

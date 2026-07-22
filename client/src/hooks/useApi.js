import { useState, useEffect, useCallback } from "react";

/**
 * fetch wrapper shared by every API call: parses JSON and normalizes errors
 * to the API's { error, detail } shape (falling back to the HTTP status).
 */
export async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || errBody.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch the client roster for a Client dropdown.
 * @param {string} [source] - "all" pulls the full roster from P_Clients as a
 *   flat array of Client_IDs (Client Service / Blue Books). The default pulls
 *   production clients as objects ({ id, name, fyStart }) for the Digital reports.
 * @returns {{ clients, loading, error }}
 */
export function useClients(source = "") {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const url = source ? `/api/clients?source=${encodeURIComponent(source)}` : "/api/clients";
    apiFetch(url)
      .then((data) => setClients(data.clients || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [source]);

  return { clients, loading, error };
}

/**
 * Fetch Appeal IDs when a client is selected (Blue Book appeal dropdown).
 * @param {string} clientId
 * @param {"backtest"|"test"|"match"} filterType
 */
export function useAppealIds(clientId, filterType = "backtest") {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clientId) {
      setAppeals([]);
      return;
    }

    setLoading(true);
    setError(null);

    apiFetch(`/api/appeal-ids?clientId=${encodeURIComponent(clientId)}&type=${filterType}`)
      .then((data) => setAppeals(data.appeals || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [clientId, filterType]);

  return { appeals, loading, error };
}

/**
 * Blue Books: run the response-rate / ROI query for a client + appeal code.
 */
export function useBlueBook() {
  const emptyState = {
    status: "idle", // idle | loading | success | error
    rows: null,
    totals: null,
    cpm: null,
    campaignId: null,
    downloadUrl: null,
    error: null,
  };
  const [state, setState] = useState(emptyState);

  const run = useCallback(async ({ clientId, appealCode }) => {
    setState({ ...emptyState, status: "loading" });

    try {
      const data = await apiFetch("/api/blue-books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, appealCode }),
      });
      setState({
        status: "success",
        rows: data.rows || [],
        totals: data.totals || null,
        cpm: data.cpm || null,
        campaignId: data.campaignId || null,
        downloadUrl: data.downloadUrl || null,
        error: null,
      });
    } catch (err) {
      setState({ ...emptyState, status: "error", error: err.message });
    }
  }, []);

  const reset = useCallback(() => setState(emptyState), []);

  return { ...state, run, reset };
}

/**
 * Quarterly Business Report (Client Service tab).
 * run({ clientId }) → POST /api/qbr. `data` holds every section's datasets.
 */
export function useQBR() {
  const emptyState = {
    status: "idle", // idle | loading | success | error
    clientName: null,
    data: null,
    error: null,
  };
  const [state, setState] = useState(emptyState);

  const run = useCallback(async ({ clientId }) => {
    setState({ ...emptyState, status: "loading" });
    try {
      const res = await apiFetch("/api/qbr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      setState({
        status: "success",
        clientName: res.clientName || null,
        data: res.data || null,
        error: null,
      });
    } catch (err) {
      setState({ ...emptyState, status: "error", error: err.message });
    }
  }, []);

  const reset = useCallback(() => setState(emptyState), []);

  return { ...state, run, reset };
}

/**
 * New & Reactivated Donors report (Digital tab).
 * run({ clientId, view }) → POST /api/new-reactivated
 */
export function useNewReactivated() {
  const emptyState = {
    status: "idle", // idle | loading | success | error
    rows: null,
    clientName: null,
    view: null,
    error: null,
  };
  const [state, setState] = useState(emptyState);

  const run = useCallback(async ({ clientId, view }) => {
    setState({ ...emptyState, status: "loading" });
    try {
      const data = await apiFetch("/api/new-reactivated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, view }),
      });
      setState({
        status: "success",
        rows: data.rows || [],
        clientName: data.clientName || null,
        view: data.view,
        error: null,
      });
    } catch (err) {
      setState({ ...emptyState, status: "error", error: err.message });
    }
  }, []);

  const reset = useCallback(() => setState(emptyState), []);

  return { ...state, run, reset };
}

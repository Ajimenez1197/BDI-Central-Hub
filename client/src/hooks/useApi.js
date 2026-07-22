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
 * Fetch the production-client roster for the Client dropdown.
 * @returns {{ clients: {id,name,fyStart}[], loading, error }}
 */
export function useClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch("/api/clients")
      .then((data) => setClients(data.clients || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { clients, loading, error };
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

/**
 * Donor Pyramid report (Client Service tab).
 * run({ clientId, period }) → POST /api/donor-pyramid
 */
export function useDonorPyramid() {
  const emptyState = { status: "idle", data: null, error: null };
  const [state, setState] = useState(emptyState);

  const run = useCallback(async ({ clientId, period }) => {
    setState({ ...emptyState, status: "loading" });
    try {
      const data = await apiFetch("/api/donor-pyramid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, period }),
      });
      setState({ status: "success", data, error: null });
    } catch (err) {
      setState({ ...emptyState, status: "error", error: err.message });
    }
  }, []);

  const reset = useCallback(() => setState(emptyState), []);

  return { ...state, run, reset };
}

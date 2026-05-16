import { useEffect, useState, useCallback } from "react";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import type { RuntimeInfo } from "@hermes-hub/shared";

type WebRuntimeResponse = { ok: true; data: RuntimeInfo } | { ok: false; error: { message: string } };

export default function RuntimeBanner() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (method: "GET" | "POST" = "GET") => {
    setLoading(true);
    try {
      const res = await fetch(method === "POST" ? "/api/runtime/rescan" : "/api/runtime", { method });
      const result = (await res.json()) as WebRuntimeResponse;
      if (result.ok) setRuntime(result.data);
      else setError(result.error.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <Alert severity="info">Checking Hermes Runtime...</Alert>;
  }

  if (error || !runtime) {
    return <Alert severity="error">Runtime detection failed: {error || "Unknown error"}</Alert>;
  }

  const cliOk = runtime.hermesCli.found;
  const homeOk = runtime.hermesHome.found;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Chip
        label={cliOk ? `CLI: ${runtime.hermesCli.version?.slice(0, 30) || "found"}` : "CLI: missing"}
        color={cliOk ? "success" : "error"}
        size="small"
      />
      <Chip
        label={homeOk ? `HOME: ${runtime.hermesHome.path}` : "HOME: missing"}
        color={homeOk ? "success" : "warning"}
        size="small"
      />
      <Chip
        label={`source: ${runtime.hermesHome.source || "?"}`}
        variant="outlined"
        size="small"
      />
      <Button size="small" onClick={() => void load("POST")}>Rescan</Button>
    </Box>
  );
}

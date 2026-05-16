import { useEffect, useState, useCallback } from "react";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { RuntimeInfo } from "@hermes-hub/shared";

type WebRuntimeResponse =
  | { ok: true; data: RuntimeInfo }
  | { ok: false; error: { message: string } };

export default function RuntimeStatusCard() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (method: "GET" | "POST" = "GET") => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        method === "POST" ? "/api/runtime/rescan" : "/api/runtime",
        { method },
      );
      const result = (await res.json()) as WebRuntimeResponse;
      if (result.ok) {
        setRuntime(result.data);
      } else {
        setError(result.error.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Skeleton variant="rounded" width={120} height={22} />
          <Skeleton variant="rounded" width={180} height={22} />
          <Skeleton variant="rounded" width={100} height={22} />
        </Stack>
      </Paper>
    );
  }

  if (error || !runtime) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Runtime detection failed: {error || "Unknown error"}
      </Alert>
    );
  }

  const cliOk = runtime.hermesCli.found;
  const homeOk = runtime.hermesHome.found;

  return (
    <Paper
      sx={{
        p: 1.5,
        mb: 2,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        flexWrap: "wrap",
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", mr: 0.5 }}
      >
        Runtime
      </Typography>

      <Chip
        label={
          cliOk
            ? `CLI ${runtime.hermesCli.version?.slice(0, 24) || "found"}`
            : "CLI missing"
        }
        color={cliOk ? "success" : "error"}
        size="small"
      />

      <Chip
        label={
          homeOk
            ? runtime.hermesHome.path
            : "HOME missing"
        }
        color={homeOk ? "success" : "warning"}
        size="small"
        sx={{
          maxWidth: 320,
          "& .MuiChip-label": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        }}
      />

      <Chip
        label={runtime.hermesHome.source || "unknown"}
        variant="outlined"
        size="small"
      />

      <Box sx={{ flexGrow: 1 }} />

      <Button
        size="small"
        variant="text"
        startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
        onClick={() => void load("POST")}
      >
        Rescan
      </Button>
    </Paper>
  );
}

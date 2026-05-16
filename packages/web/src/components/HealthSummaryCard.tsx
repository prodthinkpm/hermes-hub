import { useEffect, useState, useCallback } from "react";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import ErrorIcon from "@mui/icons-material/Error";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import type { HealthCheckResult, HealthCheckItem } from "@hermes-hub/shared";

type WebHealthResponse =
  | { ok: true; data: HealthCheckResult }
  | { ok: false; error: { message: string } };

const STATUS_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />,
  warn: <WarningIcon sx={{ fontSize: 16, color: "warning.main" }} />,
  fail: <ErrorIcon sx={{ fontSize: 16, color: "error.main" }} />,
  unknown: <HelpOutlineIcon sx={{ fontSize: 16, color: "text.secondary" }} />,
};

function statusColor(status: string) {
  if (status === "pass") return "success" as const;
  if (status === "warn") return "warning" as const;
  if (status === "fail") return "error" as const;
  return "default" as const;
}

function CheckItemRow({ item }: { item: HealthCheckItem }) {
  return (
    <ListItem disablePadding sx={{ gap: 1, py: 0.25 }}>
      <ListItemIcon sx={{ minWidth: 20 }}>
        {STATUS_ICON[item.status] ?? STATUS_ICON.unknown}
      </ListItemIcon>
      <ListItemText
        primary={item.message}
        secondary={
          item.suggestion
            ? `Fix: ${item.suggestion}`
            : undefined
        }
        primaryTypographyProps={{ variant: "body2", sx: { fontWeight: 500 } }}
        secondaryTypographyProps={{
          variant: "caption",
          sx: { color: item.status === "fail" || item.status === "warn" ? "warning.main" : "text.secondary", mt: 0.25, fontWeight: 500 },
        }}
      />
      <Chip
        label={item.status.toUpperCase()}
        color={statusColor(item.status)}
        size="small"
        sx={{ minWidth: 48, flexShrink: 0 }}
      />
    </ListItem>
  );
}

export default function HealthSummaryCard({ profileId }: { profileId: string }) {
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (method: "GET" | "POST" = "GET") => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/profiles/${encodeURIComponent(profileId)}/health`,
        { method },
      );
      const result = (await res.json()) as WebHealthResponse;
      if (result.ok) {
        setHealth(result.data);
      } else {
        setError(result.error.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Skeleton variant="text" width="40%" height={28} />
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Skeleton variant="rounded" width={64} height={24} />
          <Skeleton variant="rounded" width={64} height={24} />
          <Skeleton variant="rounded" width={64} height={24} />
        </Stack>
        <Box sx={{ mt: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="text" height={24} />
          ))}
        </Box>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Health check unavailable: {error}
      </Alert>
    );
  }

  if (!health) return null;

  const s = health.summary;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h3">Health</Typography>
          <Typography variant="caption" color="text.secondary">
            Last checked {new Date(health.checkedAt).toLocaleString()}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
          onClick={() => void load("POST")}
        >
          Run Check
        </Button>
      </Box>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {s.fail > 0 && (
          <Chip
            label={`${s.fail} fail`}
            color="error"
            size="small"
          />
        )}
        {s.warn > 0 && (
          <Chip
            label={`${s.warn} warn`}
            color="warning"
            size="small"
          />
        )}
        <Chip
          label={`${s.pass} pass`}
          color="success"
          size="small"
        />
        {s.unknown > 0 && (
          <Chip
            label={`${s.unknown} unknown`}
            color="default"
            size="small"
          />
        )}
        <Chip
          label={`${s.total} total`}
          variant="outlined"
          size="small"
        />
      </Stack>

      <List dense disablePadding>
        {health.items.map((item) => (
          <CheckItemRow key={item.checkId} item={item} />
        ))}
      </List>
    </Paper>
  );
}

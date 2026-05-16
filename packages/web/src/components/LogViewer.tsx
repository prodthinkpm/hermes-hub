import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import type { LogsResult } from "@hermes-hub/shared";

type WebLogsResponse = { ok: true; data: LogsResult } | { ok: false; error: { message: string } };

const LINE_COUNTS = [50, 100, 200, 500];

export default function LogViewer({ profileId, onBack }: { profileId: string; onBack: () => void }) {
  const [data, setData] = useState<LogsResult | null>(null);
  const [lines, setLines] = useState(200);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/logs?lines=${lines}`);
      const result = (await res.json()) as WebLogsResponse;
      if (!result.ok) { setError(result.error.message); return; }
      setData(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [profileId, lines]);

  useEffect(() => { void load(); }, [load]);

  const getLineColor = (level?: string) => {
    switch (level) {
      case "ERROR": return "error.main";
      case "WARNING": case "WARN": return "#f0a362";
      default: return "text.primary";
    }
  };

  if (loading) return <Typography color="text.secondary">Loading logs...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h2">Logs</Typography>
        <Button size="small" onClick={onBack}>Back to Detail</Button>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
          {data?.path || "—"}
        </Typography>
        <Typography variant="body2">Files: {data?.totalFiles ?? 0}</Typography>

        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select value={lines} onChange={(e) => setLines(Number(e.target.value))}>
            {LINE_COUNTS.map((n) => (
              <MenuItem key={n} value={n}>{n} lines</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button size="small" variant="outlined" onClick={() => void load()}>Refresh</Button>
      </Box>

      {data && data.lines.length === 0 ? (
        <Alert severity="info">No log lines found.</Alert>
      ) : (
        <Box
          component="pre"
          sx={{
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            fontSize: 12,
            bgcolor: "background.paper",
            color: "text.primary",
            p: 2,
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            maxHeight: 600,
            overflow: "auto",
            lineHeight: 1.5,
            m: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {data?.lines.map((line, i) => (
            <Box
              key={i}
              sx={{ color: getLineColor(line.level) }}
            >
              {line.timestamp ? `${line.timestamp}  ` : ""}
              {line.level ? `${line.level}  ` : ""}
              {line.message}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

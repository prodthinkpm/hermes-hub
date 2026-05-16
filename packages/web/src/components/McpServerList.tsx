import { useEffect, useState, useCallback } from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import TableContainer from "@mui/material/TableContainer";
import Paper from "@mui/material/Paper";
import TableHead from "@mui/material/TableHead";
import type { McpServer } from "@hermes-hub/shared";

type Response = { ok: true; data: McpServer[] } | { ok: false; error: { message: string } };

function statusColor(s: string) {
  if (s === "configured") return "success" as const;
  if (s === "missing_command") return "warning" as const;
  if (s === "disabled") return "default" as const;
  return "default" as const;
}

export default function McpServerList({ profileId }: { profileId: string }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/mcp`);
      const r = await res.json() as Response;
      if (r.ok) setServers(r.data); else setError(r.error.message);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Skeleton variant="rounded" height={48} />;
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (servers.length === 0) return <Typography variant="body2" color="text.secondary">No MCP servers configured.</Typography>;

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Command</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {servers.map((s) => (
            <TableRow key={s.name}>
              <TableCell>{s.name}</TableCell>
              <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{s.command}</TableCell>
              <TableCell><Chip label={s.status} color={statusColor(s.status)} size="small" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

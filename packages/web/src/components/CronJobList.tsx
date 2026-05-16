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
import type { CronJob } from "@hermes-hub/shared";

type Response = { ok: true; data: CronJob[] } | { ok: false; error: { message: string } };

export default function CronJobList({ profileId }: { profileId: string }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/cron`);
      const r = await res.json() as Response;
      if (r.ok) setJobs(r.data); else setError(r.error.message);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Skeleton variant="rounded" height={48} />;
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (jobs.length === 0) return <Typography variant="body2" color="text.secondary">No cron jobs configured.</Typography>;

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Schedule</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {jobs.map((j) => (
            <TableRow key={j.name}>
              <TableCell>{j.name}</TableCell>
              <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{j.schedule}</TableCell>
              <TableCell>
                <Chip label={j.enabled ? "Enabled" : "Disabled"} color={j.enabled ? "success" : "default"} size="small" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

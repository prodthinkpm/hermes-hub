import { useEffect, useState, useCallback } from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import type { ProfileSummary, ProfilesListResponse } from "@hermes-hub/shared";

type WebProfilesResponse = { ok: true; data: ProfilesListResponse } | { ok: false; error: { message: string } };

function statusColor(status: string) {
  if (status === "ready") return "success" as const;
  if (status === "warning") return "warning" as const;
  if (status === "error") return "error" as const;
  return "default" as const;
}

function fileLabel(file: ProfileSummary["config"]) {
  if (!file.exists) return "Missing";
  if (!file.readable) return "Unreadable";
  return file.updatedAt ? `Ready (${new Date(file.updatedAt).toLocaleString()})` : "Ready";
}

export default function ProfileList({
  onSelect,
  onCreate,
}: {
  onSelect: (id: string) => void;
  onCreate?: () => void;
}) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profiles");
      const result = (await res.json()) as WebProfilesResponse;
      if (!result.ok) { setError(result.error.message); return; }
      if (result.data.errors.length > 0) {
        setError(result.data.errors.map((e) => e.message).join("; "));
        return;
      }
      setProfiles(result.data.profiles);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Typography color="text.secondary">Scanning profiles...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h2">Profiles</Typography>
        <Button size="small" onClick={() => void load()}>Rescan</Button>
        {onCreate && <Button size="small" variant="contained" onClick={onCreate}>New Profile</Button>}
      </Box>
      {profiles.length === 0 ? (
        <Typography color="text.secondary">
          No Hermes profiles found. Create a profile using Hermes CLI, then Rescan.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>HERMES_HOME</TableCell>
                <TableCell>config.yaml</TableCell>
                <TableCell>SOUL.md</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((p) => (
                <TableRow
                  key={p.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => onSelect(p.id)}
                >
                  <TableCell>{p.name}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {p.hermesHome}
                  </TableCell>
                  <TableCell>{fileLabel(p.config)}</TableCell>
                  <TableCell>{fileLabel(p.soul)}</TableCell>
                  <TableCell>
                    {p.lastUpdated ? new Date(p.lastUpdated).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Chip label={p.status} color={statusColor(p.status)} size="small" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

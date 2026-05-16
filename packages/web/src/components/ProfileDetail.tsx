import { useEffect, useState, useCallback } from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import TableContainer from "@mui/material/TableContainer";
import type { ProfileDetail as ProfileDetailType } from "@hermes-hub/shared";

type WebDetailResponse = { ok: true; data: ProfileDetailType } | { ok: false; error: { message: string } };

export default function ProfileDetail({
  profileId,
  onBack,
  onOpenConfig,
  onOpenSoul,
  onClone,
}: {
  profileId: string;
  onBack: () => void;
  onOpenConfig?: () => void;
  onOpenSoul?: () => void;
  onClone?: () => void;
}) {
  const [detail, setDetail] = useState<ProfileDetailType | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}`);
      const result = (await res.json()) as WebDetailResponse;
      if (!result.ok) { setError(result.error.message); return; }
      setDetail(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Typography color="text.secondary">Loading profile...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;
  if (!detail) return null;

  const c = detail.config;
  const s = detail.soul;
  const parseLabel = c.parseStatus === "ok" ? "Valid YAML" : c.parseStatus === "error" ? "Cannot parse" : c.parseStatus === "empty" ? "Empty" : "—";
  const summary = c.summary ? [c.summary.model, c.summary.provider, c.summary.workspace].filter(Boolean).join(" / ") || "—" : "—";
  const soulContent = s.empty === undefined ? "—" : s.empty ? "Empty" : "Has content";

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h2">Profile Detail</Typography>
        <Button size="small" onClick={onBack}>Back to Profiles</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
        <Table size="small">
          <TableBody>
            {[
              ["HERMES_HOME", detail.hermesHome],
              ["Status", <Chip key="st" label={detail.status} color="success" size="small" />],
              ["config.yaml path", c.path],
              ["config.yaml exists", c.exists ? "Yes" : "No"],
              ["config.yaml readable", c.readable ? "Yes" : "No"],
              ["config.yaml writable", c.writable ? "Yes" : "No"],
              ["config.yaml size", c.sizeBytes != null ? `${c.sizeBytes} bytes` : "—"],
              ["config.yaml modified", c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "—"],
              ["config.yaml parse", parseLabel],
              ["config summary", summary],
              ["SOUL.md path", s.path],
              ["SOUL.md exists", s.exists ? "Yes" : "No"],
              ["SOUL.md readable", s.readable ? "Yes" : "No"],
              ["SOUL.md writable", s.writable ? "Yes" : "No"],
              ["SOUL.md size", s.sizeBytes != null ? `${s.sizeBytes} bytes` : "—"],
              ["SOUL.md modified", s.updatedAt ? new Date(s.updatedAt).toLocaleString() : "—"],
              ["SOUL.md content", soulContent],
            ].map(([label, value], i) => (
              <TableRow key={i}>
                <TableCell sx={{ fontWeight: 500, width: "35%" }}>{label}</TableCell>
                <TableCell>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {!s.exists && (
        <Typography color="warning.main" sx={{ mb: 1 }}>
          SOUL.md does not exist. Open the SOUL editor to create it.
        </Typography>
      )}

      <Box sx={{ display: "flex", gap: 1 }}>
        {onOpenConfig && <Button variant="outlined" size="small" onClick={onOpenConfig}>Open Config</Button>}
        {onOpenSoul && <Button variant="outlined" size="small" onClick={onOpenSoul}>Open SOUL</Button>}
        {onClone && <Button variant="outlined" size="small" onClick={onClone}>Clone</Button>}
      </Box>
    </Box>
  );
}

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import TableContainer from "@mui/material/TableContainer";
import type { ProfileSummary } from "@hermes-hub/shared";

export default function ProfileImport({ onBack }: { onBack: () => void }) {
  const [path, setPath] = useState("");
  const [msg, setMsg] = useState("");
  const [msgColor, setMsgColor] = useState<"success" | "error">("success");
  const [result, setResult] = useState<ProfileSummary | null>(null);

  const handleImport = async () => {
    if (!path.trim()) { setMsg("Path is required."); setMsgColor("error"); return; }
    setMsg("Importing...");
    setResult(null);
    try {
      const res = await fetch("/api/profiles/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: path.trim() }),
      });
      const r = await res.json();
      if (!r.ok) { setMsg(r.error.message); setMsgColor("error"); return; }
      setResult(r.data.profile);
      setMsg("Profile found. You can now view it in the list.");
      setMsgColor("success");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setMsgColor("error");
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h2">Import Profile</Typography>
        <Button size="small" onClick={onBack}>Back to Profiles</Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Enter the path to an existing Hermes profile directory. The directory must contain at least a config.yaml or SOUL.md.
      </Alert>

      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        <TextField
          label="Profile Path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/path/to/profile"
          size="small"
          sx={{ flex: 1, maxWidth: 480 }}
        />
        <Button variant="contained" onClick={handleImport}>Import</Button>
      </Box>

      {msg && <Alert severity={msgColor} sx={{ mb: 2 }}>{msg}</Alert>}

      {result && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableBody>
              {[
                ["Name", result.name],
                ["HERMES_HOME", result.hermesHome],
                ["config.yaml", result.config.exists ? "Found" : "Missing"],
                ["SOUL.md", result.soul.exists ? "Found" : "Missing"],
                ["Status", result.status],
              ].map(([label, value], i) => (
                <TableRow key={i}>
                  <TableCell sx={{ fontWeight: 500 }}>{label}</TableCell>
                  <TableCell>{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

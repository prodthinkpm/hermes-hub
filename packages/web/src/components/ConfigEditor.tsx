import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import DiffPreview from "./DiffPreview";
import BackupHistory from "./BackupHistory";
import type { EditableFileResult, ValidateFileResponse, SaveFileResponse } from "@hermes-hub/shared";

type WebFileResponse = { ok: true; data: EditableFileResult } | { ok: false; error: { message: string } };
type WebValidateResponse = { ok: true; data: ValidateFileResponse } | { ok: false; error: { message: string } };
type WebSaveResponse = { ok: true; data: SaveFileResponse } | { ok: false; error: { message: string } };

export default function ConfigEditor({ profileId, onBack }: { profileId: string; onBack: () => void }) {
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [mtime, setMtime] = useState("");
  const [readable, setReadable] = useState(false);
  const [writable, setWritable] = useState(false);
  const [validation, setValidation] = useState<ValidateFileResponse | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveColor, setSaveColor] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [original, setOriginal] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/config`);
      const result = (await res.json()) as WebFileResponse;
      if (!result.ok) { setError(result.error.message); return; }
      const f = result.data;
      setContent(f.content);
      setOriginal(f.content);
      setPath(f.path);
      setMtime(f.status.updatedAt ? new Date(f.status.updatedAt).toLocaleString() : "—");
      setReadable(f.status.readable);
      setWritable(f.status.writable);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  const handleValidate = async () => {
    setValidation(null);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/config/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId, type: "config", content }),
      });
      const result = (await res.json()) as WebValidateResponse;
      if (result.ok) setValidation(result.data);
    } catch (e) {
      setValidation({ valid: false, errors: [{ code: "UNKNOWN_ERROR", message: e instanceof Error ? e.message : String(e) }], warnings: [] });
    }
  };

  const handleSave = async () => {
    setSaveMsg("Saving...");
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/config`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId, type: "config", content }),
      });
      const result = (await res.json()) as WebSaveResponse;
      if (!result.ok) { setSaveMsg(result.error.message); setSaveColor("error"); return; }
      setSaveMsg(`Saved. Backup: ${result.data.backup.path}`);
      setSaveColor("success");
      setOriginal(content);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
      setSaveColor("error");
    }
  };

  if (loading) return <Typography color="text.secondary">Loading config...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h2">Config Editor</Typography>
        <Button size="small" onClick={onBack}>Back to Detail</Button>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 1, flexWrap: "wrap" }}>
        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>File: {path}</Typography>
        <Typography variant="body2">Modified: {mtime}</Typography>
        <Chip label={`${readable ? "R" : "No R"} / ${writable ? "W" : "No W"}`} size="small" />
      </Box>

      <TextField
        multiline
        fullWidth
        minRows={24}
        maxRows={36}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        sx={{ fontFamily: "monospace", fontSize: 13, mb: 1 }}
        inputProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 13 } }}
      />

      <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
        <Button variant="outlined" size="small" onClick={handleValidate}>Validate YAML</Button>
        <Button variant="outlined" size="small" onClick={() => setDiffOpen(true)}>Preview Changes</Button>
        <Button variant="contained" size="small" onClick={handleSave}>Save config.yaml</Button>
      </Box>

      {validation && (
        <Alert severity={validation.valid ? "success" : "error"} sx={{ mb: 1 }}>
          {validation.valid ? "Valid YAML" : validation.errors.map((e, i) => (
            <span key={i}>
              {e.message}
              {e.details?.line ? ` (line ${String(e.details.line)}${e.details.column ? `, col ${String(e.details.column)}` : ""})` : ""}
            </span>
          ))}
        </Alert>
      )}

      {saveMsg && <Alert severity={saveColor} sx={{ mb: 1 }}>{saveMsg}</Alert>}

      <Alert severity="info" sx={{ fontSize: 12 }}>
        Security notice: This editor shows real file content. Do not paste it into untrusted environments.
      </Alert>

      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Backup History</Typography>
        <BackupHistory profileId={profileId} />
      </Box>

      <DiffPreview
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        original={original}
        modified={content}
        fileType="config.yaml"
      />
    </Box>
  );
}

import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import MonacoEditor from "./MonacoEditor";
import DiffPreview from "./DiffPreview";
import BackupHistory from "./BackupHistory";
import { SOUL_TEMPLATES } from "../data/soulTemplates";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { EditableFileResult, ValidateFileResponse, SaveFileResponse } from "@hermes-hub/shared";

type WebFileResponse = { ok: true; data: EditableFileResult } | { ok: false; error: { message: string } };
type WebValidateResponse = { ok: true; data: ValidateFileResponse } | { ok: false; error: { message: string } };
type WebSaveResponse = { ok: true; data: SaveFileResponse } | { ok: false; error: { message: string } };

export default function SoulEditor({ profileId, onBack }: { profileId: string; onBack: () => void }) {
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [mtime, setMtime] = useState("");
  const [readable, setReadable] = useState(false);
  const [exists, setExists] = useState(false);
  const [validation, setValidation] = useState<ValidateFileResponse | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveColor, setSaveColor] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [original, setOriginal] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [insertMode, setInsertMode] = useState<"append" | "replace">("append");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/soul`);
      const result = (await res.json()) as WebFileResponse;
      if (!result.ok) { setError(result.error.message); return; }
      const f = result.data;
      setContent(f.content);
      setOriginal(f.content);
      setPath(f.path);
      setMtime(f.status.updatedAt ? new Date(f.status.updatedAt).toLocaleString() : "—");
      setReadable(f.status.readable);
      setExists(f.status.exists);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  const handleCheck = async () => {
    setValidation(null);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/soul/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId, type: "soul", content }),
      });
      const result = (await res.json()) as WebValidateResponse;
      if (result.ok) setValidation(result.data);
    } catch (e) {
      setValidation({ valid: false, errors: [{ code: "UNKNOWN_ERROR", message: e instanceof Error ? e.message : String(e) }], warnings: [] });
    }
  };

  const handleSave = async () => {
    if (content.trim().length === 0) {
      setSaveMsg("Save blocked: SOUL.md must not be empty.");
      setSaveColor("error");
      return;
    }
    setSaveMsg("Saving...");
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/soul`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId, type: "soul", content }),
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

  if (loading) return <Typography color="text.secondary">Loading SOUL.md...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h2">SOUL.md Editor</Typography>
        <Button size="small" onClick={onBack}>Back to Detail</Button>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 1, flexWrap: "wrap" }}>
        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>File: {path}</Typography>
        <Typography variant="body2">Modified: {mtime}</Typography>
        <Chip label={`${readable ? "R" : "No R"}`} size="small" />
      </Box>

      {!exists && (
        <Alert severity="info" sx={{ mb: 1 }}>
          SOUL.md does not exist yet. It will be created when you save.
        </Alert>
      )}

      <Box sx={{ mb: 1 }}>
        <MonacoEditor
          language="markdown"
          value={content}
          onChange={setContent}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
        <Button variant="outlined" size="small" onClick={handleCheck}>Validate Content</Button>
        <Button variant="outlined" size="small" onClick={() => setDiffOpen(true)}>Preview Changes</Button>
        <Button variant="outlined" size="small" onClick={() => setTemplateOpen(true)}>Insert Template</Button>
        <Button variant="contained" size="small" onClick={handleSave}>Save SOUL.md</Button>
      </Box>

      {validation && (
        <Alert severity={validation.valid ? "success" : "error"} sx={{ mb: 1 }}>
          {validation.valid ? "Content OK" : validation.errors.map((e, i) => <span key={i}>{e.message}</span>)}
        </Alert>
      )}

      {saveMsg && <Alert severity={saveColor} sx={{ mb: 1 }}>{saveMsg}</Alert>}

      <Typography variant="body2" color="text.secondary">
        Note: Empty SOUL.md files are not recommended and will be blocked on save.
      </Typography>

      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Backup History</Typography>
        <BackupHistory profileId={profileId} />
      </Box>

      <DiffPreview
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        original={original}
        modified={content}
        fileType="SOUL.md"
      />

      <Dialog open={templateOpen} onClose={() => setTemplateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Insert SOUL Template</DialogTitle>
        <DialogContent>
          <RadioGroup value={insertMode} onChange={(e) => setInsertMode(e.target.value as "append" | "replace")} row sx={{ mb: 1 }}>
            <FormControlLabel value="append" control={<Radio size="small" />} label="Append" />
            <FormControlLabel value="replace" control={<Radio size="small" />} label="Replace" />
          </RadioGroup>
          <List dense>
            {SOUL_TEMPLATES.map((t) => (
              <ListItemButton
                key={t.id}
                onClick={() => {
                  setContent(insertMode === "replace" ? t.content : (content ? content + "\n\n" + t.content : t.content));
                  setTemplateOpen(false);
                }}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemText primary={t.name} secondary={t.description} />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setTemplateOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

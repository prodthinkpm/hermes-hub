import { useEffect, useState, useCallback } from "react";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import ListItemSecondaryAction from "@mui/material/ListItemSecondaryAction";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import type { BackupEntry } from "@hermes-hub/shared";

type WebBackupsResponse = { ok: true; data: BackupEntry[] } | { ok: false; error: { message: string } };
type WebBackupContentResponse = { ok: true; data: { content: string } } | { ok: false; error: { message: string } };

export default function BackupHistory({ profileId }: { profileId: string }) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [viewFileName, setViewFileName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/backups`);
      const result = (await res.json()) as WebBackupsResponse;
      if (result.ok) setBackups(result.data);
      else setError(result.error.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  const handleView = async (backup: BackupEntry) => {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/backups/${encodeURIComponent(backup.id)}`);
      const result = (await res.json()) as WebBackupContentResponse;
      if (result.ok) {
        setViewContent(result.data.content);
        setViewFileName(backup.fileName);
      }
    } catch { /* ignore */ }
  };

  if (loading) return <Skeleton variant="rounded" height={60} />;
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (backups.length === 0) return <Typography variant="body2" color="text.secondary">No backups yet.</Typography>;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {backups.length} backup{backups.length !== 1 ? "s" : ""}
      </Typography>
      <List dense disablePadding>
        {backups.slice(0, 5).map((b) => (
          <ListItem key={b.id} disablePadding sx={{ gap: 1, py: 0.25 }}>
            <ListItemText
              primary={b.fileName}
              secondary={new Date(b.createdAt).toLocaleString()}
              primaryTypographyProps={{ variant: "body2" }}
              secondaryTypographyProps={{ variant: "caption" }}
            />
            <ListItemSecondaryAction>
              <Chip label={`${(b.sizeBytes / 1024).toFixed(1)} KB`} size="small" variant="outlined" sx={{ mr: 0.5 }} />
              <Button size="small" onClick={() => handleView(b)}>View</Button>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>

      <Dialog open={viewContent !== null} onClose={() => setViewContent(null)} maxWidth="md" fullWidth>
        <DialogTitle>{viewFileName}</DialogTitle>
        <DialogContent dividers>
          <Box
            component="pre"
            sx={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", m: 0, maxHeight: "50vh", overflow: "auto" }}
          >
            {viewContent}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setViewContent(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

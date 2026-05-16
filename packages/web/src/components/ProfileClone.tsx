import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import type { ProfileDetail as ProfileDetailType } from "@hermes-hub/shared";

export default function ProfileClone({
  profileId,
  onBack,
}: {
  profileId: string;
  onBack: () => void;
}) {
  const [profileName, setProfileName] = useState("");
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState("");
  const [msgColor, setMsgColor] = useState<"success" | "error">("success");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/profiles/${encodeURIComponent(profileId)}`)
      .then((r) => r.json())
      .then((result: { ok: true; data: ProfileDetailType } | { ok: false; error: { message: string } }) => {
        if (result.ok) {
          setProfileName(result.data.name);
          setNewName(`${result.data.name}-clone`);
        }
      })
      .catch(() => {});
  }, [profileId]);

  const handleClone = async () => {
    const name = newName.trim();
    if (!name) { setMsg("Profile name is required."); setMsgColor("error"); return; }
    setMsg("Cloning...");
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/clone`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newName: name }),
      });
      const result = await res.json();
      if (!result.ok) { setMsg(result.error.message); setMsgColor("error"); return; }
      setMsg(`Cloned as "${name}". Copied: ${result.data.copiedFiles.join(", ") || "none"}. Back to list to see it.`);
      setMsgColor("success");
      setDone(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setMsgColor("error");
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h2">Clone Profile</Typography>
        <Button size="small" onClick={onBack}>Back to Detail</Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        {profileName ? `Source: ${profileName}. ` : ""}Only config.yaml and SOUL.md are copied. Sensitive files (.env, auth.json) are never copied.
      </Alert>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label="New Profile Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          size="small"
          sx={{ maxWidth: 360 }}
        />
        <Box>
          <Button variant="contained" onClick={handleClone} disabled={done}>
            Clone
          </Button>
        </Box>
      </Box>

      {msg && <Alert severity={msgColor} sx={{ mt: 2 }}>{msg}</Alert>}
    </Box>
  );
}

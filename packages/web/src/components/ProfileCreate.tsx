import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";

export default function ProfileCreate({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [soulContent, setSoulContent] = useState("");
  const [msg, setMsg] = useState("");
  const [msgColor, setMsgColor] = useState<"success" | "error">("success");

  const handleCreate = async () => {
    if (!name.trim()) { setMsg("Profile Name is required."); setMsgColor("error"); return; }
    setMsg("Creating...");
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), displayName, description, model, provider, workspace, soulContent }),
      });
      const result = await res.json();
      if (!result.ok) { setMsg(result.error.message); setMsgColor("error"); return; }
      setMsg(`Profile "${name}" created. Back to list to see it.`);
      setMsgColor("success");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setMsgColor("error");
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h2">Create Profile</Typography>
        <Button size="small" onClick={onBack}>Back to Profiles</Button>
      </Box>

      <Stepper activeStep={step} sx={{ mb: 3 }}>
        <Step><StepLabel>Name</StepLabel></Step>
        <Step><StepLabel>Model</StepLabel></Step>
        <Step><StepLabel>SOUL.md</StepLabel></Step>
      </Stepper>

      {step === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField label="Profile Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. my-agent" size="small" />
          <TextField label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. My Agent" size="small" />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" size="small" />
        </Box>
      )}

      {step === 1 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. deepseek-v4-pro" size="small" />
          <TextField label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. deepseek" size="small" />
          <TextField label="Workspace" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="e.g. ~/projects/my-agent" size="small" />
        </Box>
      )}

      {step === 2 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Optional. A default template will be used if left empty.
          </Typography>
          <TextField
            multiline
            fullWidth
            minRows={12}
            value={soulContent}
            onChange={(e) => setSoulContent(e.target.value)}
            placeholder="# Identity\n\nYou are a helpful Hermes Agent..."
            inputProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 13 } }}
          />
        </Box>
      )}

      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
        {step < 2 && (
          <Button
            variant="contained"
            onClick={() => {
              if (step === 0 && !name.trim()) { setMsg("Profile Name is required."); setMsgColor("error"); return; }
              setMsg("");
              setStep(step + 1);
            }}
          >
            Next
          </Button>
        )}
        {step === 2 && (
          <Button variant="contained" color="primary" onClick={handleCreate}>
            Create Profile
          </Button>
        )}
      </Box>

      {msg && <Alert severity={msgColor} sx={{ mt: 2 }}>{msg}</Alert>}
    </Box>
  );
}

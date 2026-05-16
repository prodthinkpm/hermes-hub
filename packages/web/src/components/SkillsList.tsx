import { useEffect, useState, useCallback } from "react";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import type { SkillEntry } from "@hermes-hub/shared";

type Response = { ok: true; data: SkillEntry[] } | { ok: false; error: { message: string } };

function riskColor(r: string) {
  if (r === "high") return "error" as const;
  if (r === "medium") return "warning" as const;
  if (r === "low") return "success" as const;
  return "default" as const;
}

export default function SkillsList({ profileId }: { profileId: string }) {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/skills`);
      const r = await res.json() as Response;
      if (r.ok) setSkills(r.data); else setError(r.error.message);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Skeleton variant="rounded" height={48} />;
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (skills.length === 0) return <Typography variant="body2" color="text.secondary">No skills found.</Typography>;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {skills.map((s) => (
          <Box key={s.name} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Chip label={s.name} size="small" />
            <Chip label={s.risk} color={riskColor(s.risk)} size="small" variant="outlined" />
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

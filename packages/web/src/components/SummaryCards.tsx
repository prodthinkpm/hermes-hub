import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import type { ProfileSummary } from "@hermes-hub/shared";

type SummaryData = {
  total: number;
  ready: number;
  missingSoul: number;
  runtimeUnknown: number;
  lastScan: string;
};

export function computeSummary(
  profiles: ProfileSummary[],
  scannedAt?: string,
): SummaryData {
  return {
    total: profiles.length,
    ready: profiles.filter((p) => p.status === "ready").length,
    missingSoul: profiles.filter((p) => !p.soul.exists).length,
    runtimeUnknown: profiles.length,
    lastScan: scannedAt || new Date().toISOString(),
  };
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Paper
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}
      >
        {label}
      </Typography>
      <Typography
        variant="h3"
        sx={{ color: "text.primary" }}
      >
        {value}
      </Typography>
    </Paper>
  );
}

export default function SummaryCards({ data }: { data: SummaryData }) {
  const formattedTime = data.lastScan
    ? new Date(data.lastScan).toLocaleString()
    : "—";

  return (
    <Box sx={{ mb: 2 }}>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <SummaryItem label="Total Profiles" value={data.total} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <SummaryItem label="Ready" value={data.ready} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <SummaryItem label="Missing SOUL" value={data.missingSoul} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <SummaryItem label="Runtime Unknown" value={data.runtimeUnknown} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 4 }}>
          <SummaryItem label="Last Scan" value={formattedTime} />
        </Grid>
      </Grid>
    </Box>
  );
}

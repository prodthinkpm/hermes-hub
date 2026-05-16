import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import FileOpenIcon from "@mui/icons-material/FileOpen";
import RefreshIcon from "@mui/icons-material/Refresh";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { ProfileSummary, ProfilesListResponse } from "@hermes-hub/shared";
import RuntimeStatusCard from "./RuntimeStatusCard";
import SummaryCards, { computeSummary } from "./SummaryCards";
import StatusChip, {
  deriveConfigStatus,
  deriveSoulStatus,
  deriveHealthStatus,
} from "./StatusChip";

type WebProfilesResponse =
  | { ok: true; data: ProfilesListResponse }
  | { ok: false; error: { message: string } };

export default function ProfilesPage({
  onSelect,
  onCreate,
  onImport,
}: {
  onSelect: (id: string) => void;
  onCreate?: () => void;
  onImport?: () => void;
}) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [scannedAt, setScannedAt] = useState<string>("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/profiles");
      const result = (await res.json()) as WebProfilesResponse;
      if (!result.ok) {
        setLoadError(result.error.message);
        return;
      }
      if (result.data.errors.length > 0) {
        setLoadError(result.data.errors.map((e) => e.message).join("; "));
        return;
      }
      setProfiles(result.data.profiles);
      setScannedAt(result.data.scannedAt);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = computeSummary(profiles, scannedAt);

  return (
    <Box>
      {/* Page Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 3,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography variant="h1" sx={{ mb: 0.5 }}>
            Profiles
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage local Hermes Agent Profiles
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="text"
            startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
            onClick={() => void load()}
          >
            Rescan
          </Button>
          {onImport && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileOpenIcon sx={{ fontSize: 16 }} />}
              onClick={onImport}
            >
              Import
            </Button>
          )}
          {onCreate && (
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={onCreate}
            >
              New Profile
            </Button>
          )}
        </Stack>
      </Box>

      {/* Runtime Status */}
      <RuntimeStatusCard />

      {/* Summary Cards */}
      <SummaryCards data={summary} />

      {/* Profiles Table */}
      {loading ? (
        <Stack spacing={1}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={40} />
          ))}
        </Stack>
      ) : loadError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      ) : profiles.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            No Hermes profiles found. Create a profile or import an existing one.
          </Typography>
          {onCreate && (
            <Button
              variant="contained"
              size="small"
              onClick={onCreate}
              sx={{ mt: 1.5 }}
              startIcon={<AddIcon />}
            >
              New Profile
            </Button>
          )}
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>HERMES_HOME</TableCell>
                <TableCell>Config</TableCell>
                <TableCell>SOUL</TableCell>
                <TableCell>Runtime</TableCell>
                <TableCell>Health</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((p) => {
                const configStatus = deriveConfigStatus(p.config);
                const soulStatus = deriveSoulStatus(p.soul);
                const runtimeStatus = "unknown";
                const healthStatus = deriveHealthStatus(
                  p.status,
                  configStatus,
                  soulStatus,
                  runtimeStatus,
                );

                return (
                  <TableRow
                    key={p.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => onSelect(p.id)}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {p.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.6875rem",
                          color: "text.secondary",
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.hermesHome}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <StatusChip category="config" status={configStatus} />
                    </TableCell>
                    <TableCell>
                      <StatusChip category="soul" status={soulStatus} />
                    </TableCell>
                    <TableCell>
                      <StatusChip category="runtime" status={runtimeStatus} />
                    </TableCell>
                    <TableCell>
                      <StatusChip category="health" status={healthStatus} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {p.lastUpdated
                          ? new Date(p.lastUpdated).toLocaleString()
                          : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={0.5}
                        justifyContent="flex-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Tooltip title="View profile">
                          <IconButton
                            size="small"
                            onClick={() => onSelect(p.id)}
                          >
                            <OpenInNewIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="More">
                          <IconButton size="small">
                            <MoreVertIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

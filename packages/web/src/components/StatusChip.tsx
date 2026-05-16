import Chip, { type ChipProps } from "@mui/material/Chip";

type StatusLevel = "success" | "warning" | "error" | "info" | "default";

const CONFIG_LABEL: Record<string, string> = {
  ready: "Ready",
  missing: "Missing",
  invalid: "Invalid",
  "permission error": "Perm Error",
  unknown: "Unknown",
};

const SOUL_LABEL: Record<string, string> = {
  ready: "Ready",
  missing: "Missing",
  empty: "Empty",
  "permission error": "Perm Error",
  unknown: "Unknown",
};

const RUNTIME_LABEL: Record<string, string> = {
  running: "Running",
  stopped: "Stopped",
  degraded: "Degraded",
  unknown: "Unknown",
};

const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  warning: "Warning",
  error: "Error",
  unknown: "Unknown",
};

const colorForConfig = (status: string): StatusLevel => {
  const s = status.toLowerCase();
  if (s === "ready") return "success";
  if (s === "missing" || s === "unknown") return "warning";
  if (s === "invalid" || s === "permission error") return "error";
  return "default";
};

const colorForSoul = (status: string): StatusLevel => {
  const s = status.toLowerCase();
  if (s === "ready") return "success";
  if (s === "missing" || s === "empty") return "warning";
  if (s === "permission error") return "error";
  if (s === "unknown") return "default";
  return "default";
};

const colorForRuntime = (status: string): StatusLevel => {
  const s = status.toLowerCase();
  if (s === "running") return "success";
  if (s === "degraded") return "warning";
  if (s === "error") return "error";
  if (s === "stopped" || s === "unknown") return "default";
  return "default";
};

const colorForHealth = (status: string): StatusLevel => {
  const s = status.toLowerCase();
  if (s === "healthy" || s === "ready") return "success";
  if (s === "warning") return "warning";
  if (s === "error") return "error";
  if (s === "unknown") return "default";
  return "default";
};

function resolveLabel(category: string, status: string): string {
  const s = status.toLowerCase();
  switch (category) {
    case "config":
      return CONFIG_LABEL[s] || s;
    case "soul":
      return SOUL_LABEL[s] || s;
    case "runtime":
      return RUNTIME_LABEL[s] || s;
    case "health":
      return HEALTH_LABEL[s] || s;
    default:
      return s;
  }
}

function resolveColor(category: string, status: string): StatusLevel {
  switch (category) {
    case "config":
      return colorForConfig(status);
    case "soul":
      return colorForSoul(status);
    case "runtime":
      return colorForRuntime(status);
    case "health":
      return colorForHealth(status);
    default:
      return "default";
  }
}

function deriveConfigStatus(file: {
  exists: boolean;
  readable: boolean;
}): string {
  if (!file.exists) return "missing";
  if (!file.readable) return "permission error";
  return "ready";
}

function deriveSoulStatus(file: {
  exists: boolean;
  readable: boolean;
  empty?: boolean;
}): string {
  if (!file.exists) return "missing";
  if (!file.readable) return "permission error";
  if (file.empty) return "empty";
  return "ready";
}

function deriveHealthStatus(
  profileStatus: string,
  configStatus: string,
  soulStatus: string,
  runtimeStatus: string,
): string {
  if (profileStatus === "error") return "error";
  if (configStatus === "invalid" || configStatus === "permission error") return "error";
  if (soulStatus === "permission error") return "error";
  if (soulStatus === "missing" || soulStatus === "empty") return "warning";
  if (configStatus === "missing") return "warning";
  if (runtimeStatus === "degraded") return "warning";
  if (configStatus === "ready" && soulStatus === "ready") return "healthy";
  if (profileStatus === "ready") return "healthy";
  return "unknown";
}

export {
  resolveLabel,
  resolveColor,
  deriveConfigStatus,
  deriveSoulStatus,
  deriveHealthStatus,
};

export default function StatusChip({
  category,
  status,
  size = "small",
  ...props
}: {
  category: "config" | "soul" | "runtime" | "health";
  status: string;
  size?: ChipProps["size"];
} & Omit<ChipProps, "label" | "color" | "size">) {
  const label = resolveLabel(category, status);
  const color = resolveColor(category, status);

  return (
    <Chip
      label={label}
      color={color}
      size={size}
      {...props}
    />
  );
}

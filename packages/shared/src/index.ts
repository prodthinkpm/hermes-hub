export const ApiErrorCode = {
  UnknownError: "UNKNOWN_ERROR",
  ValidationError: "VALIDATION_ERROR",
  NotFound: "NOT_FOUND",
  PermissionDenied: "PERMISSION_DENIED",
  FileReadFailed: "FILE_READ_FAILED",
  FileWriteFailed: "FILE_WRITE_FAILED",
  YamlInvalid: "YAML_INVALID",
  HermesCliNotFound: "HERMES_CLI_NOT_FOUND",
  HermesCliVersionFailed: "HERMES_CLI_VERSION_FAILED",
  HermesHomeNotFound: "HERMES_HOME_NOT_FOUND",
  ProfileNotFound: "PROFILE_NOT_FOUND",
  UnsafeHostWarning: "UNSAFE_HOST_WARNING",
} as const;

export type ApiErrorCode =
  (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type HealthCheckData = {
  name: "hermes-hub";
  version: string;
  timestamp: string;
};

export type HermesCliInfo = {
  found: boolean;
  path?: string;
  version?: string;
  error?: ApiError;
};

export type HermesHomeSource =
  | "cli-arg"
  | "hermes-config-home"
  | "env"
  | "fallback";

export type HermesHomeInfo = {
  found: boolean;
  path?: string;
  source?: HermesHomeSource;
  error?: ApiError;
};

export type RuntimeInfo = {
  nodeVersion: string;
  platform: string;
  arch: string;
  hermesCli: HermesCliInfo;
  hermesHome: HermesHomeInfo;
  checkedAt: string;
};

export type ProfileFileStatus = {
  path: string;
  exists: boolean;
  readable: boolean;
  writable: boolean;
  sizeBytes?: number;
  updatedAt?: string;
  error?: ApiError;
};

export type ProfileHealthStatus = "ready" | "warning" | "error" | "unknown";

export type ProfileSummary = {
  id: string;
  name: string;
  hermesHome: string;
  config: ProfileFileStatus;
  soul: ProfileFileStatus;
  status: ProfileHealthStatus;
  health: ProfileHealthStatus;
  lastUpdated?: string;
  updatedAt?: string;
  warnings: ApiError[];
  errors: ApiError[];
};

export type ConfigSummary = {
  model?: string;
  provider?: string;
  workspace?: string;
};

export type ProfileDetail = {
  id: string;
  name: string;
  hermesHome: string;
  config: ProfileFileStatus & {
    parseStatus?: "ok" | "error" | "empty";
    summary?: ConfigSummary;
  };
  soul: ProfileFileStatus & {
    empty?: boolean;
  };
  status: ProfileHealthStatus;
  warnings: ApiError[];
  errors: ApiError[];
};

export type EditableFileType = "config" | "soul";

export type EditableFileResult = {
  profileId: string;
  type: EditableFileType;
  path: string;
  content: string;
  status: ProfileFileStatus;
};

export type ValidateFileRequest = {
  profileId: string;
  type: EditableFileType;
  content: string;
};

export type ValidateFileResponse = {
  valid: boolean;
  errors: ApiError[];
  warnings: ApiError[];
};

export type BackupInfo = {
  path: string;
  createdAt: string;
  sizeBytes?: number;
};

export type SaveFileRequest = {
  profileId: string;
  type: EditableFileType;
  content: string;
};

export type SaveFileResponse = {
  profileId: string;
  type: EditableFileType;
  path: string;
  backup: BackupInfo;
  savedAt: string;
};

export type ProfilesListResponse = {
  profiles: ProfileSummary[];
  scannedAt: string;
  sourceHermesHome?: string;
  warnings: ApiError[];
  errors: ApiError[];
};

export type CreateProfileRequest = {
  name: string;
  displayName?: string;
  description?: string;
  model?: string;
  provider?: string;
  workspace?: string;
  soulContent?: string;
};

export type CreateProfileResponse = {
  profile: ProfileSummary;
};

export type CloneProfileRequest = {
  sourceProfileId: string;
  newName: string;
  copyEnv?: boolean;
  copyAuth?: boolean;
  copyMemories?: boolean;
  copySessions?: boolean;
  copyLogs?: boolean;
};

export type CloneProfileResponse = {
  profile: ProfileSummary;
  copiedFiles: string[];
  skippedFiles: string[];
};

export type ImportProfileRequest = {
  path: string;
  name?: string;
};

export type ImportProfileResponse = {
  profile: ProfileSummary;
};

export type GatewayStatus = {
  status: "running" | "stopped" | "error" | "unknown";
  pid?: number;
  uptime?: string;
  errorMessage?: string;
};

export type GatewayActionResult = {
  success: boolean;
  message: string;
  pid?: number;
};

export type LogLine = {
  timestamp?: string;
  level?: string;
  message: string;
  source?: string;
};

export type LogQuery = {
  lines?: number;
  filter?: string;
};

export type LogsResult = {
  lines: LogLine[];
  totalFiles: number;
  path: string;
};

export type HealthCheckSeverity = "info" | "warning" | "error";

export type HealthCheckStatus = "pass" | "warn" | "fail" | "unknown";

export type HealthCheckCategory =
  | "cli"
  | "home"
  | "profile_dir"
  | "config"
  | "soul"
  | "gateway"
  | "logs"
  | "backup"
  | "security";

export type HealthCheckItem = {
  checkId: string;
  name: string;
  category: HealthCheckCategory;
  severity: HealthCheckSeverity;
  status: HealthCheckStatus;
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
};

export type HealthCheckSummary = {
  pass: number;
  warn: number;
  fail: number;
  unknown: number;
  total: number;
};

export type HealthCheckResult = {
  profileId: string;
  checkedAt: string;
  items: HealthCheckItem[];
  summary: HealthCheckSummary;
};

import type {
  ApiResponse,
  EditableFileResult,
  HealthCheckData,
  ProfileDetail,
  ProfilesListResponse,
  ProfileSummary,
  RuntimeInfo,
  SaveFileResponse,
  ValidateFileResponse,
} from "@hermes-hub/shared";

export type WebHealthResponse = ApiResponse<HealthCheckData>;
export type WebRuntimeResponse = ApiResponse<RuntimeInfo>;
export type WebProfilesResponse = ApiResponse<ProfilesListResponse>;
export type WebProfileDetailResponse = ApiResponse<ProfileDetail>;
export type WebConfigFileResponse = ApiResponse<EditableFileResult>;
export type WebValidateConfigResponse = ApiResponse<ValidateFileResponse>;
export type WebSaveFileResponse = ApiResponse<SaveFileResponse>;

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  return element;
}

function statusText(profile: ProfileSummary) {
  if (profile.errors.length > 0) {
    return "Error";
  }

  if (profile.warnings.length > 0) {
    return "Warning";
  }

  return "Ready";
}

function fileText(file: ProfileSummary["config"]) {
  if (!file.exists) {
    return "Missing";
  }

  if (!file.readable) {
    return "Unreadable";
  }

  return file.updatedAt
    ? `Ready (${new Date(file.updatedAt).toLocaleString()})`
    : "Ready";
}

function renderRuntime(runtime: RuntimeInfo) {
  const cliStatus = runtime.hermesCli.found ? "found" : "missing";
  const homeStatus = runtime.hermesHome.found
    ? runtime.hermesHome.path
    : "missing";
  const version = runtime.hermesCli.version ?? "unknown";

  return [
    "Hermes Runtime",
    `CLI: ${cliStatus}`,
    `Version: ${version}`,
    `HERMES_HOME: ${homeStatus}`,
  ].join(" | ");
}

export function mountRuntimeBanner(container: HTMLElement) {
  const status = document.createElement("span");
  const rescanButton = document.createElement("button");

  rescanButton.type = "button";
  rescanButton.textContent = "Rescan";

  async function loadRuntime(method: "GET" | "POST" = "GET") {
    status.textContent = "Hermes Runtime | Checking...";

    try {
      const response = await fetch(
        method === "POST" ? "/api/runtime/rescan" : "/api/runtime",
        { method },
      );
      const result = (await response.json()) as WebRuntimeResponse;

      status.textContent = result.ok
        ? renderRuntime(result.data)
        : `Hermes Runtime | error: ${result.error.message}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.textContent = `Hermes Runtime | error: ${message}`;
    }
  }

  rescanButton.addEventListener("click", () => {
    void loadRuntime("POST");
  });

  container.replaceChildren(status, rescanButton);
  void loadRuntime();
}

function renderProfilesTable(
  profiles: ProfileSummary[],
  onSelect: (profileId: string) => void,
) {
  const table = createElement("table", "profiles-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (const label of [
    "Name",
    "HERMES_HOME",
    "config.yaml",
    "SOUL.md",
    "Last Updated",
    "Status",
  ]) {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.append(th);
  }

  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");

  for (const profile of profiles) {
    const row = document.createElement("tr");

    row.style.cursor = "pointer";
    row.addEventListener("click", () => {
      onSelect(profile.id);
    });

    const cells = [
      profile.name,
      profile.hermesHome,
      fileText(profile.config),
      fileText(profile.soul),
      profile.lastUpdated
        ? new Date(profile.lastUpdated).toLocaleString()
        : "—",
      statusText(profile),
    ];

    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value;
      row.append(td);
    }

    tbody.append(row);
  }

  table.append(tbody);

  return table;
}

export function mountProfileList(
  container: HTMLElement,
  onSelect: (profileId: string) => void,
) {
  const header = createElement("div", "section-header");
  const title = document.createElement("h2");
  const refreshButton = document.createElement("button");
  const content = createElement("div", "profiles-content");

  title.textContent = "Profiles";
  refreshButton.type = "button";
  refreshButton.textContent = "Rescan Profiles";
  header.append(title, refreshButton);

  async function loadProfiles() {
    content.textContent = "Scanning profiles...";

    try {
      const response = await fetch("/api/profiles");
      const result = (await response.json()) as WebProfilesResponse;

      if (!result.ok) {
        content.textContent = `Profile scan failed: ${result.error.message}`;
        return;
      }

      if (result.data.errors.length > 0) {
        content.textContent = `Profile scan failed: ${result.data.errors
          .map((error) => error.message)
          .join("; ")}`;
        return;
      }

      if (result.data.profiles.length === 0) {
        content.textContent = "No Hermes profiles found. Create a profile using Hermes CLI, then Rescan.";
        return;
      }

      content.replaceChildren(
        renderProfilesTable(result.data.profiles, onSelect),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      content.textContent = `Profile scan failed: ${message}`;
    }
  }

  refreshButton.addEventListener("click", () => {
    void loadProfiles();
  });

  container.replaceChildren(header, content);
  void loadProfiles();
}

function boolText(value: boolean | undefined) {
  if (value === undefined) {
    return "Unknown";
  }

  return value ? "Yes" : "No";
}

function renderDetail(detail: ProfileDetail) {
  const wrapper = createElement("div", "profile-detail");

  const config = detail.config;
  const soul = detail.soul;

  const configStatus =
    config.parseStatus === "ok"
      ? "Valid YAML"
      : config.parseStatus === "error"
        ? "Cannot parse"
        : config.parseStatus === "empty"
          ? "Empty file"
          : "—";

  const summary =
    config.summary &&
    (config.summary.model || config.summary.provider || config.summary.workspace)
      ? [
          config.summary.model ?? "",
          config.summary.provider ?? "",
          config.summary.workspace ?? "",
        ]
          .filter(Boolean)
          .join(" / ")
      : "—";

  const soulEmptyText =
    soul.empty === undefined
      ? "—"
      : soul.empty
        ? "Empty"
        : "Has content";

  const rows: Array<[string, string]> = [
    ["HERMES_HOME", detail.hermesHome],
    ["Status", detail.status],
    ["config.yaml path", config.path],
    ["config.yaml exists", boolText(config.exists)],
    ["config.yaml readable", boolText(config.readable)],
    ["config.yaml writable", boolText(config.writable)],
    [
      "config.yaml size",
      config.sizeBytes != null ? `${config.sizeBytes} bytes` : "—",
    ],
    [
      "config.yaml modified",
      config.updatedAt
        ? new Date(config.updatedAt).toLocaleString()
        : "—",
    ],
    ["config.yaml parse", configStatus],
    ["config summary (model / provider / workspace)", summary],
    ["SOUL.md path", soul.path],
    ["SOUL.md exists", boolText(soul.exists)],
    ["SOUL.md readable", boolText(soul.readable)],
    ["SOUL.md writable", boolText(soul.writable)],
    [
      "SOUL.md size",
      soul.sizeBytes != null ? `${soul.sizeBytes} bytes` : "—",
    ],
    [
      "SOUL.md modified",
      soul.updatedAt
        ? new Date(soul.updatedAt).toLocaleString()
        : "—",
    ],
    ["SOUL.md content", soulEmptyText],
  ];

  const table = createElement("table", "detail-table");

  for (const [label, value] of rows) {
    const row = document.createElement("tr");
    const th = document.createElement("th");

    th.textContent = label;
    const td = document.createElement("td");

    td.textContent = value;
    row.append(th, td);
    table.append(row);
  }

  if (!soul.exists) {
    const note = document.createElement("p");

    note.className = "detail-note";
    note.textContent =
      "SOUL.md does not exist. Open the SOUL editor to create it.";
    wrapper.append(table, note);
  } else {
    wrapper.append(table);
  }

  if (detail.warnings.length > 0) {
    const warningsBlock = createElement("div", "detail-warnings");

    for (const w of detail.warnings) {
      const p = document.createElement("p");

      p.textContent = `Warning: ${w.message}`;
      warningsBlock.append(p);
    }

    wrapper.append(warningsBlock);
  }

  if (detail.errors.length > 0) {
    const errorsBlock = createElement("div", "detail-errors");

    for (const e of detail.errors) {
      const p = document.createElement("p");

      p.textContent = `Error: ${e.message}`;
      errorsBlock.append(p);
    }

    wrapper.append(errorsBlock);
  }

  return wrapper;
}

export function mountProfileDetail(
  container: HTMLElement,
  profileId: string,
  onBack: () => void,
  onOpenConfig?: () => void,
  onOpenSoul?: () => void,
) {
  const header = createElement("div", "section-header");
  const title = document.createElement("h2");
  const backButton = document.createElement("button");
  const content = createElement("div", "detail-content");

  title.textContent = "Profile Detail";
  backButton.type = "button";
  backButton.textContent = "Back to Profiles";
  backButton.addEventListener("click", onBack);

  const actionButtons = createElement("div", "detail-actions");
  const openConfigButton = document.createElement("button");
  const openSoulButton = document.createElement("button");

  openConfigButton.type = "button";
  openConfigButton.textContent = "Open Config";

  if (onOpenConfig) {
    openConfigButton.addEventListener("click", onOpenConfig);
  } else {
    openConfigButton.disabled = true;
    openConfigButton.textContent = "Open Config (unavailable)";
  }

  openSoulButton.type = "button";
  openSoulButton.textContent = "Open SOUL";

  if (onOpenSoul) {
    openSoulButton.addEventListener("click", onOpenSoul);
  } else {
    openSoulButton.disabled = true;
    openSoulButton.textContent = "Open SOUL (unavailable)";
  }

  actionButtons.append(openConfigButton, openSoulButton);
  header.append(title, backButton);

  async function loadDetail() {
    content.textContent = "Loading profile detail...";

    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}`);
      const result = (await response.json()) as WebProfileDetailResponse;

      if (!result.ok) {
        content.textContent = `Failed to load profile: ${result.error.message}`;
        return;
      }

      content.replaceChildren(renderDetail(result.data));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      content.textContent = `Failed to load profile: ${message}`;
    }
  }

  container.replaceChildren(header, content, actionButtons);
  void loadDetail();
}

function renderSaveResult(target: HTMLElement, result: WebSaveFileResponse) {
  if (!result.ok) {
    target.textContent = `Save failed: ${result.error.message}`;
    target.style.color = "#cf222e";
    return;
  }

  const { backup } = result.data;

  target.textContent =
    `Saved successfully. Backup: ${backup.path} (${backup.createdAt ? new Date(backup.createdAt).toLocaleString() : ""})`;
  target.style.color = "#1a7f37";
}

function renderValidationResult(validation: ValidateFileResponse) {
  const wrapper = createElement("div", "validation-result");

  if (validation.valid) {
    const status = document.createElement("p");

    status.textContent = "YAML Validation: Valid YAML";
    status.style.color = "#1a7f37";
    wrapper.append(status);
  } else {
    const status = document.createElement("p");

    status.textContent = "YAML Validation: Invalid YAML";
    status.style.color = "#cf222e";
    wrapper.append(status);

    for (const error of validation.errors) {
      const details = document.createElement("p");

      details.style.fontSize = "13px";
      details.style.marginLeft = "12px";

      const loc =
        error.details
          ? [
              error.details.line ? `line ${String(error.details.line)}` : "",
              error.details.column ? `column ${String(error.details.column)}` : "",
            ]
              .filter(Boolean)
              .join(", ")
          : "";

      details.textContent = loc
        ? `${error.message} (${loc})`
        : error.message;
      wrapper.append(details);
    }
  }

  return wrapper;
}

export function mountConfigEditor(
  container: HTMLElement,
  profileId: string,
  onBack: () => void,
) {
  const header = createElement("div", "section-header");
  const title = document.createElement("h2");
  const backButton = document.createElement("button");
  const metaBar = createElement("div", "meta-bar");
  const content = createElement("div", "editor-content");
  const actionsBar = createElement("div", "editor-actions");

  title.textContent = "Config Editor";
  backButton.type = "button";
  backButton.textContent = "Back to Detail";
  backButton.addEventListener("click", onBack);

  const filePathLabel = document.createElement("span");
  const fileMtimeLabel = document.createElement("span");
  const fileStatusLabel = document.createElement("span");

  filePathLabel.style.marginRight = "20px";
  fileMtimeLabel.style.marginRight = "20px";
  metaBar.append(filePathLabel, fileMtimeLabel, fileStatusLabel);

  const textarea = document.createElement("textarea");

  textarea.rows = 30;
  textarea.style.width = "100%";
  textarea.style.fontFamily = "ui-monospace, SFMono-Regular, monospace";
  textarea.style.fontSize = "13px";
  textarea.style.padding = "12px";
  textarea.style.boxSizing = "border-box";

  const validateButton = document.createElement("button");
  const validationContainer = createElement("div");
  const saveResult = createElement("div", "save-result");

  validateButton.type = "button";
  validateButton.textContent = "Validate YAML";

  const saveButton = document.createElement("button");

  saveButton.type = "button";
  saveButton.textContent = "Save config.yaml";

  const securityNotice = document.createElement("p");

  securityNotice.style.fontSize = "12px";
  securityNotice.style.color = "#656d76";
  securityNotice.style.marginTop = "8px";
  securityNotice.textContent =
    "Security notice: This editor shows the real file content. Do not paste it into untrusted environments.";

  actionsBar.append(validateButton, saveButton);

  validateButton.addEventListener("click", async () => {
    validationContainer.textContent = "Validating...";
    saveResult.textContent = "";

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(profileId)}/config/validate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileId, type: "config", content: textarea.value }),
        },
      );
      const result = (await response.json()) as WebValidateConfigResponse;

      if (!result.ok) {
        validationContainer.textContent = `Validation failed: ${result.error.message}`;
        return;
      }

      validationContainer.replaceChildren(
        renderValidationResult(result.data),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      validationContainer.textContent = `Validation failed: ${message}`;
    }
  });

  saveButton.addEventListener("click", async () => {
    saveResult.textContent = "Saving...";
    validationContainer.textContent = "";

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(profileId)}/config`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileId, type: "config", content: textarea.value }),
        },
      );
      const result = (await response.json()) as WebSaveFileResponse;

      renderSaveResult(saveResult, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      saveResult.textContent = `Save failed: ${message}`;
      saveResult.style.color = "#cf222e";
    }
  });

  async function loadConfig() {
    content.textContent = "Loading config...";

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(profileId)}/config`,
      );
      const result = (await response.json()) as WebConfigFileResponse;

      if (!result.ok) {
        content.textContent = `Failed to load config: ${result.error.message}`;
        return;
      }

      const file = result.data;

      filePathLabel.textContent = `File: ${file.path}`;

      fileMtimeLabel.textContent = file.status.updatedAt
        ? `Modified: ${new Date(file.status.updatedAt).toLocaleString()}`
        : "Modified: —";

      const readable = file.status.readable ? "Readable" : "Not readable";
      const writable = file.status.writable ? "Writable" : "Not writable";

      fileStatusLabel.textContent = `Status: ${readable} | ${writable}`;

      textarea.value = file.content;

      if (!file.status.exists) {
        content.textContent =
          "config.yaml does not exist yet. It will be created when you save.";
        return;
      }

      if (!file.status.readable) {
        content.textContent = "config.yaml is not readable. Check file permissions.";
        return;
      }

      content.replaceChildren(textarea);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      content.textContent = `Failed to load config: ${message}`;
    }
  }

  header.append(title, backButton);
  container.replaceChildren(
    header,
    metaBar,
    content,
    actionsBar,
    validationContainer,
    saveResult,
    securityNotice,
  );
  void loadConfig();
}

export function mountSoulEditor(
  container: HTMLElement,
  profileId: string,
  onBack: () => void,
) {
  const header = createElement("div", "section-header");
  const title = document.createElement("h2");
  const backButton = document.createElement("button");
  const metaBar = createElement("div", "meta-bar");
  const content = createElement("div", "editor-content");
  const actionsBar = createElement("div", "editor-actions");

  title.textContent = "SOUL.md Editor";
  backButton.type = "button";
  backButton.textContent = "Back to Detail";
  backButton.addEventListener("click", onBack);

  const filePathLabel = document.createElement("span");
  const fileMtimeLabel = document.createElement("span");
  const fileStatusLabel = document.createElement("span");

  filePathLabel.style.marginRight = "20px";
  fileMtimeLabel.style.marginRight = "20px";
  metaBar.append(filePathLabel, fileMtimeLabel, fileStatusLabel);

  const textarea = document.createElement("textarea");

  textarea.rows = 30;
  textarea.style.width = "100%";
  textarea.style.fontFamily = "ui-monospace, SFMono-Regular, monospace";
  textarea.style.fontSize = "13px";
  textarea.style.padding = "12px";
  textarea.style.boxSizing = "border-box";

  const validateButton = document.createElement("button");
  const validationContainer = createElement("div");
  const saveResult = createElement("div", "save-result");

  validateButton.type = "button";
  validateButton.textContent = "Validate Content";

  const saveButton = document.createElement("button");

  saveButton.type = "button";
  saveButton.textContent = "Save SOUL.md";

  const saveEmptyWarning = document.createElement("p");

  saveEmptyWarning.style.fontSize = "12px";
  saveEmptyWarning.style.color = "#656d76";
  saveEmptyWarning.style.marginTop = "8px";
  saveEmptyWarning.textContent =
    "Note: Empty SOUL.md files are not recommended and will be blocked on save.";

  actionsBar.append(validateButton, saveButton);

  validateButton.addEventListener("click", async () => {
    validationContainer.textContent = "Checking...";

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(profileId)}/soul/validate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileId, type: "soul", content: textarea.value }),
        },
      );
      const result = (await response.json()) as WebValidateConfigResponse;

      if (!result.ok) {
        validationContainer.textContent = `Check failed: ${result.error.message}`;
        return;
      }

      validationContainer.replaceChildren(
        renderValidationResult(result.data),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      validationContainer.textContent = `Check failed: ${message}`;
    }
  });

  saveButton.addEventListener("click", async () => {
    if (textarea.value.trim().length === 0) {
      saveResult.textContent =
        "Save blocked: SOUL.md content must not be empty. Add content before saving.";
      saveResult.style.color = "#cf222e";
      return;
    }

    saveResult.textContent = "Saving...";
    validationContainer.textContent = "";

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(profileId)}/soul`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileId, type: "soul", content: textarea.value }),
        },
      );
      const result = (await response.json()) as WebSaveFileResponse;

      renderSaveResult(saveResult, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      saveResult.textContent = `Save failed: ${message}`;
      saveResult.style.color = "#cf222e";
    }
  });

  async function loadSoul() {
    content.textContent = "Loading SOUL.md...";

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(profileId)}/soul`,
      );
      const result = (await response.json()) as WebConfigFileResponse;

      if (!result.ok) {
        content.textContent = `Failed to load SOUL.md: ${result.error.message}`;
        return;
      }

      const file = result.data;

      filePathLabel.textContent = `File: ${file.path}`;

      fileMtimeLabel.textContent = file.status.updatedAt
        ? `Modified: ${new Date(file.status.updatedAt).toLocaleString()}`
        : "Modified: —";

      const readable = file.status.readable ? "Readable" : "Not readable";
      const writable = file.status.writable ? "Writable" : "Not writable";

      fileStatusLabel.textContent = `Status: ${readable} | ${writable}`;

      textarea.value = file.content;

      if (!file.status.exists) {
        const note = document.createElement("p");

        note.style.marginTop = "12px";
        note.textContent =
          "SOUL.md does not exist yet. It will be created when you save.";
        content.replaceChildren(textarea, note);
        return;
      }

      if (!file.status.readable) {
        content.textContent = "SOUL.md is not readable. Check file permissions.";
        return;
      }

      content.replaceChildren(textarea);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      content.textContent = `Failed to load SOUL.md: ${message}`;
    }
  }

  header.append(title, backButton);
  container.replaceChildren(
    header,
    metaBar,
    content,
    actionsBar,
    validationContainer,
    saveResult,
    saveEmptyWarning,
  );
  void loadSoul();
}

export function mountHermesHubApp(container: HTMLElement) {
  const title = document.createElement("h1");
  const runtime = createElement("section", "runtime-banner");
  const content = createElement("section", "main-content");

  title.textContent = "Hermes Hub";

  function showList() {
    mountProfileList(content, (profileId) => {
      showDetail(profileId);
    });
  }

  function showDetail(profileId: string) {
    mountProfileDetail(
      content,
      profileId,
      showList,
      () => {
        showConfigEditor(profileId);
      },
      () => {
        showSoulEditor(profileId);
      },
    );
  }

  function showConfigEditor(profileId: string) {
    mountConfigEditor(content, profileId, () => {
      showDetail(profileId);
    });
  }

  function showSoulEditor(profileId: string) {
    mountSoulEditor(content, profileId, () => {
      showDetail(profileId);
    });
  }

  container.replaceChildren(title, runtime, content);
  mountRuntimeBanner(runtime);
  showList();
}

const appContainer = document.getElementById("app");

if (appContainer) {
  mountHermesHubApp(appContainer);
}

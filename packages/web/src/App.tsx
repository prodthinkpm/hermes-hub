import { useCallback, useState, useMemo } from "react";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import AppShell from "./components/AppShell";
import ProfilesPage from "./components/ProfilesPage";
import ProfileDetail from "./components/ProfileDetail";
import ConfigEditor from "./components/ConfigEditor";
import SoulEditor from "./components/SoulEditor";
import ProfileCreate from "./components/ProfileCreate";
import ProfileClone from "./components/ProfileClone";
import ProfileImport from "./components/ProfileImport";
import LogViewer from "./components/LogViewer";
import type { SidebarSection } from "./components/Sidebar";

type View =
  | { name: "list" }
  | { name: "detail"; profileId: string }
  | { name: "config"; profileId: string }
  | { name: "soul"; profileId: string }
  | { name: "create" }
  | { name: "clone"; profileId: string }
  | { name: "import" }
  | { name: "logs"; profileId: string }
  | { name: "placeholder"; section: string };

const PLACEHOLDER_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  gateway: "Gateway",
  logs: "Logs",
  health: "Health",
  templates: "Templates",
  settings: "Settings",
};

function PlaceholderPage({ section }: { section: string }) {
  const title = PLACEHOLDER_TITLES[section] || section;
  return (
    <Paper
      sx={{
        p: 6,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Typography variant="h2" color="text.primary">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        This section is not yet implemented. It will be available in a future release.
      </Typography>
    </Paper>
  );
}

export default function App() {
  const [view, setView] = useState<View>({ name: "list" });

  const goList = useCallback(() => setView({ name: "list" }), []);
  const goDetail = useCallback(
    (profileId: string) => setView({ name: "detail", profileId }),
    [],
  );
  const goConfig = useCallback(
    (profileId: string) => setView({ name: "config", profileId }),
    [],
  );
  const goSoul = useCallback(
    (profileId: string) => setView({ name: "soul", profileId }),
    [],
  );
  const goCreate = useCallback(() => setView({ name: "create" }), []);
  const goClone = useCallback(
    (profileId: string) => setView({ name: "clone", profileId }),
    [],
  );
  const goImport = useCallback(() => setView({ name: "import" }), []);
  const goLogs = useCallback(
    (profileId: string) => setView({ name: "logs", profileId }),
    [],
  );

  const handleNavigate = useCallback(
    (section: SidebarSection) => {
      switch (section) {
        case "profiles":
          goList();
          break;
        case "dashboard":
          goList();
          break;
        default:
          setView({ name: "placeholder", section });
      }
    },
    [goList],
  );

  const activeSection = useMemo((): SidebarSection => {
    if (view.name === "placeholder") {
      return view.section as SidebarSection;
    }
    return "profiles";
  }, [view]);

  return (
    <AppShell activeSection={activeSection} onNavigate={handleNavigate}>
      {view.name === "list" && (
        <ProfilesPage
          onSelect={goDetail}
          onCreate={goCreate}
          onImport={goImport}
        />
      )}
      {view.name === "detail" && (
        <ProfileDetail
          profileId={view.profileId}
          onBack={goList}
          onOpenConfig={() => goConfig(view.profileId)}
          onOpenSoul={() => goSoul(view.profileId)}
          onClone={() => goClone(view.profileId)}
          onViewLogs={() => goLogs(view.profileId)}
        />
      )}
      {view.name === "config" && (
        <ConfigEditor
          profileId={view.profileId}
          onBack={() => goDetail(view.profileId)}
        />
      )}
      {view.name === "soul" && (
        <SoulEditor
          profileId={view.profileId}
          onBack={() => goDetail(view.profileId)}
        />
      )}
      {view.name === "create" && (
        <ProfileCreate onBack={goList} />
      )}
      {view.name === "clone" && (
        <ProfileClone
          profileId={view.profileId}
          onBack={() => goDetail(view.profileId)}
        />
      )}
      {view.name === "import" && (
        <ProfileImport onBack={goList} />
      )}
      {view.name === "logs" && (
        <LogViewer
          profileId={view.profileId}
          onBack={() => goDetail(view.profileId)}
        />
      )}
      {view.name === "placeholder" && (
        <PlaceholderPage section={view.section} />
      )}
    </AppShell>
  );
}

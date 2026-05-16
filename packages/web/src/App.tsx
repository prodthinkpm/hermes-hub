import { useCallback, useState } from "react";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import RuntimeBanner from "./components/RuntimeBanner";
import ProfileList from "./components/ProfileList";
import ProfileDetail from "./components/ProfileDetail";
import ConfigEditor from "./components/ConfigEditor";
import SoulEditor from "./components/SoulEditor";
import ProfileCreate from "./components/ProfileCreate";
import ProfileClone from "./components/ProfileClone";

type View =
  | { name: "list" }
  | { name: "detail"; profileId: string }
  | { name: "config"; profileId: string }
  | { name: "soul"; profileId: string }
  | { name: "create" }
  | { name: "clone"; profileId: string };

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

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Box component="h1" sx={{ fontSize: "1.25rem", fontWeight: 600, mb: 2, color: "text.primary" }}>
          Hermes Hub
        </Box>
        <RuntimeBanner />
        <Box sx={{ mt: 3 }}>
          {view.name === "list" && (
            <ProfileList onSelect={goDetail} onCreate={goCreate} />
          )}
          {view.name === "detail" && (
            <ProfileDetail
              profileId={view.profileId}
              onBack={goList}
              onOpenConfig={() => goConfig(view.profileId)}
              onOpenSoul={() => goSoul(view.profileId)}
              onClone={() => goClone(view.profileId)}
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
        </Box>
      </Container>
    </Box>
  );
}

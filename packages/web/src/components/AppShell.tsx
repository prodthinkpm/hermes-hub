import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Sidebar, { type SidebarSection } from "./Sidebar";
import { DRAWER_WIDTH, APPBAR_HEIGHT } from "../theme";

export default function AppShell({
  activeSection,
  onNavigate,
  children,
}: {
  activeSection: SidebarSection;
  onNavigate: (section: SidebarSection) => void;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          minHeight: APPBAR_HEIGHT,
        }}
      >
        <Toolbar
          sx={{
            minHeight: `${APPBAR_HEIGHT}px !important`,
            px: 2,
            gap: 1,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "text.primary",
              letterSpacing: "0.02em",
            }}
          >
            Hermes Hub
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography
            variant="caption"
            color="text.secondary"
          >
            v0.1.0
          </Typography>
        </Toolbar>
      </AppBar>

      <Sidebar
        width={DRAWER_WIDTH}
        active={activeSection}
        onNavigate={onNavigate}
      />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Toolbar sx={{ minHeight: `${APPBAR_HEIGHT}px !important` }} />
        <Box sx={{ flex: 1, p: 3 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

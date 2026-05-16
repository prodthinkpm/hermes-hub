import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import DashboardIcon from "@mui/icons-material/Dashboard";
import FolderIcon from "@mui/icons-material/Folder";
import RouterIcon from "@mui/icons-material/Router";
import ArticleIcon from "@mui/icons-material/Article";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import DescriptionIcon from "@mui/icons-material/Description";
import SettingsIcon from "@mui/icons-material/Settings";
import { APPBAR_HEIGHT } from "../theme";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { id: "profiles", label: "Profiles", icon: <FolderIcon /> },
  { id: "gateway", label: "Gateway", icon: <RouterIcon /> },
  { id: "logs", label: "Logs", icon: <ArticleIcon /> },
  { id: "health", label: "Health", icon: <MonitorHeartIcon /> },
  { id: "templates", label: "Templates", icon: <DescriptionIcon /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
] as const;

export type SidebarSection = (typeof NAV_ITEMS)[number]["id"];

export default function Sidebar({
  width,
  active,
  onNavigate,
}: {
  width: number;
  active: SidebarSection;
  onNavigate: (section: SidebarSection) => void;
}) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width,
          boxSizing: "border-box",
        },
      }}
    >
      <Toolbar
        sx={{
          minHeight: APPBAR_HEIGHT,
          px: 2,
          gap: 1,
        }}
      >
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: 1,
            background: "linear-gradient(135deg, #7c8cf8 0%, #56c9a8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.625rem",
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          H
        </Box>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: "0.875rem",
            color: "text.primary",
          }}
        >
          Hermes Hub
        </Typography>
      </Toolbar>

      <List sx={{ px: 1, pt: 0 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            key={item.id}
            selected={active === item.id}
            onClick={() => onNavigate(item.id)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ flexGrow: 1 }} />

      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block" }}
        >
          Hermes Hub v0.1.0
        </Typography>
      </Box>
    </Drawer>
  );
}

import { createTheme } from "@mui/material/styles";

const DRAWER_WIDTH = 240;
const APPBAR_HEIGHT = 48;

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#7c8cf8",
      light: "#9da8ff",
      dark: "#5b6fd6",
    },
    secondary: {
      main: "#56c9a8",
      light: "#7eddc0",
      dark: "#3aa886",
    },
    background: {
      default: "#0d1117",
      paper: "#161b22",
    },
    error: {
      main: "#f06272",
      light: "#ff8a96",
      dark: "#c94456",
    },
    warning: {
      main: "#e2a654",
      light: "#f0c27a",
      dark: "#b8883a",
    },
    success: {
      main: "#43b88c",
      light: "#6ed4aa",
      dark: "#2d9a6e",
    },
    info: {
      main: "#7c8cf8",
      light: "#9da8ff",
      dark: "#5b6fd6",
    },
    text: {
      primary: "#e0e2ea",
      secondary: "#8b8fa4",
      disabled: "#555861",
    },
    divider: "#21262d",
  },
  typography: {
    fontFamily:
      '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.01em" },
    h2: { fontSize: "1.125rem", fontWeight: 600 },
    h3: { fontSize: "1rem", fontWeight: 600 },
    body1: { fontSize: "0.8125rem", lineHeight: 1.6 },
    body2: { fontSize: "0.75rem", lineHeight: 1.5 },
    caption: { fontSize: "0.6875rem", letterSpacing: "0.03em" },
  },
  shape: {
    borderRadius: 6,
  },
  spacing: 8,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: "thin",
          scrollbarColor: "#21262d #0d1117",
          "&::-webkit-scrollbar": { width: 6, height: 6 },
          "&::-webkit-scrollbar-track": { background: "#0d1117" },
          "&::-webkit-scrollbar-thumb": {
            background: "#21262d",
            borderRadius: 3,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          fontSize: "0.75rem",
          borderRadius: 6,
          padding: "4px 12px",
          minHeight: 28,
        },
        containedPrimary: {
          boxShadow: "none",
          "&:hover": { boxShadow: "none" },
        },
        outlined: {
          borderColor: "#30363d",
          "&:hover": { borderColor: "#555861" },
        },
        text: {
          color: "#8b8fa4",
          "&:hover": { color: "#e0e2ea", background: "rgba(124,140,248,0.08)" },
        },
        sizeSmall: {
          fontSize: "0.6875rem",
          padding: "2px 8px",
          minHeight: 24,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: "#8b8fa4",
          "&:hover": { color: "#e0e2ea", background: "rgba(124,140,248,0.08)" },
        },
        sizeSmall: {
          padding: 4,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontSize: "0.6875rem",
          height: 22,
          borderRadius: 4,
          fontWeight: 500,
        },
        sizeSmall: {
          fontSize: "0.625rem",
          height: 18,
        },
        filled: {
          "&.MuiChip-colorSuccess": {
            background: "rgba(67,184,140,0.15)",
            color: "#6ed4aa",
          },
          "&.MuiChip-colorError": {
            background: "rgba(240,98,114,0.15)",
            color: "#ff8a96",
          },
          "&.MuiChip-colorWarning": {
            background: "rgba(226,166,84,0.15)",
            color: "#f0c27a",
          },
          "&.MuiChip-colorInfo": {
            background: "rgba(124,140,248,0.15)",
            color: "#9da8ff",
          },
          "&.MuiChip-colorDefault": {
            background: "rgba(139,143,164,0.12)",
            color: "#8b8fa4",
          },
        },
        outlined: {
          borderColor: "#30363d",
          color: "#8b8fa4",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: "#161b22",
          border: "1px solid #21262d",
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        outlined: {
          borderColor: "#21262d",
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-root": {
            borderBottom: "1px solid #21262d",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: "0.75rem",
          padding: "8px 12px",
        },
        head: {
          fontSize: "0.6875rem",
          fontWeight: 600,
          color: "#8b8fa4",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          padding: "8px 12px",
          background: "#0d1117",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:last-child td": { borderBottom: 0 },
          "&:hover": { background: "rgba(124,140,248,0.03)" },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: "#161b22",
          borderBottom: "1px solid #21262d",
          boxShadow: "none",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: "#0d1117",
          borderRight: "1px solid #21262d",
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          margin: "2px 8px",
          padding: "6px 10px",
          fontSize: "0.8125rem",
          "&.Mui-selected": {
            background: "rgba(124,140,248,0.12)",
            color: "#9da8ff",
            "&:hover": { background: "rgba(124,140,248,0.16)" },
            "& .MuiListItemIcon-root": { color: "#9da8ff" },
          },
          "&:hover": { background: "rgba(139,143,164,0.08)" },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          minWidth: 32,
          color: "#8b8fa4",
          "& .MuiSvgIcon-root": { fontSize: "1.125rem" },
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          fontSize: "0.8125rem",
          fontWeight: 500,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: "#21262d",
          fontSize: "0.6875rem",
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontSize: "0.75rem",
        },
      },
    },
    MuiContainer: {
      styleOverrides: {
        root: {
          paddingLeft: 24,
          paddingRight: 24,
        },
      },
    },
  },
});

export { DRAWER_WIDTH, APPBAR_HEIGHT };
export default theme;

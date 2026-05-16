import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#7c8cf8",
    },
    secondary: {
      main: "#60d4b4",
    },
    background: {
      default: "#10121a",
      paper: "#181b28",
    },
    error: {
      main: "#f06272",
    },
    warning: {
      main: "#f0a362",
    },
    success: {
      main: "#60d4b4",
    },
    info: {
      main: "#7c8cf8",
    },
    text: {
      primary: "#e0e2ea",
      secondary: "#9498a8",
    },
    divider: "#2a2d3a",
  },
  typography: {
    fontFamily:
      '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontSize: "1.5rem", fontWeight: 700 },
    h2: { fontSize: "1.25rem", fontWeight: 600 },
    body1: { fontSize: "0.875rem" },
    body2: { fontSize: "0.8125rem" },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:last-child td": { borderBottom: 0 },
        },
      },
    },
  },
});

export default theme;

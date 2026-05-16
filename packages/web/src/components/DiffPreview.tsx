import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

type DiffLine = {
  type: "add" | "remove" | "same";
  text: string;
  lineNum?: number;
};

function computeDiff(original: string, modified: string): DiffLine[] {
  const oLines = original.split("\n");
  const mLines = modified.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = oLines.length;
  const n = mLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oLines[i - 1] === mLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  let i = m;
  let j = n;
  const reversed: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oLines[i - 1] === mLines[j - 1]) {
      reversed.push({ type: "same", text: oLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversed.push({ type: "add", text: mLines[j - 1], lineNum: j });
      j--;
    } else {
      reversed.push({ type: "remove", text: oLines[i - 1], lineNum: i });
      i--;
    }
  }
  result.push(...reversed.reverse());
  return result;
}

function diffLineColor(type: DiffLine["type"]) {
  if (type === "add") return "rgba(67,184,140,0.15)";
  if (type === "remove") return "rgba(240,98,114,0.15)";
  return "transparent";
}

function diffPrefix(type: DiffLine["type"]) {
  if (type === "add") return "+";
  if (type === "remove") return "−";
  return " ";
}

export default function DiffPreview({
  open,
  onClose,
  original,
  modified,
  fileType,
}: {
  open: boolean;
  onClose: () => void;
  original: string;
  modified: string;
  fileType: string;
}) {
  const diff = computeDiff(original, modified);
  const changes = diff.filter((d) => d.type !== "same").length;
  const noChanges = changes === 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Preview Changes — {fileType}
        {noChanges && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            No changes detected. The file content is unchanged.
          </Typography>
        )}
        {!noChanges && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {changes} line{changes !== 1 ? "s" : ""} changed
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        <Box
          component="pre"
          sx={{
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            fontSize: 12,
            lineHeight: 1.6,
            margin: 0,
            overflow: "auto",
            maxHeight: "60vh",
          }}
        >
          {diff.map((line, i) => (
            <Box
              key={i}
              sx={{
                display: "flex",
                background: diffLineColor(line.type),
                minHeight: "1.6em",
              }}
            >
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  width: 20,
                  textAlign: "center",
                  color:
                    line.type === "add"
                      ? "success.main"
                      : line.type === "remove"
                        ? "error.main"
                        : "text.disabled",
                  fontWeight: 600,
                  flexShrink: 0,
                  userSelect: "none",
                }}
              >
                {diffPrefix(line.type)}
              </Box>
              <Box component="span" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {line.text}
              </Box>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

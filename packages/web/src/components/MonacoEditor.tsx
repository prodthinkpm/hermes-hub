import { Suspense, lazy } from "react";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";

const Editor = lazy(() => import("@monaco-editor/react"));

type MonacoEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language: "yaml" | "markdown";
  readOnly?: boolean;
  height?: string | number;
};

function EditorFallback() {
  return <Skeleton variant="rounded" height={400} />;
}

export default function MonacoEditor({
  value,
  onChange,
  language,
  readOnly = false,
  height = 400,
}: MonacoEditorProps) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Suspense fallback={<EditorFallback />}>
        <Editor
          height={height}
          language={language}
          value={value}
          onChange={(v) => onChange(v ?? "")}
          theme="vs-dark"
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', Consolas, monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            renderWhitespace: "selection",
            padding: { top: 8 },
          }}
          loading={<EditorFallback />}
        />
      </Suspense>
    </Box>
  );
}

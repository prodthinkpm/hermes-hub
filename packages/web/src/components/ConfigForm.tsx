import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";

type ConfigFields = {
  model: string;
  provider: string;
  workspace: string;
  gatewayEnabled: boolean;
};

export function parseConfigFields(yaml: string): ConfigFields {
  const modelMatch = yaml.match(/^\s*model:\s*(\S+)/m);
  const providerMatch = yaml.match(/^\s*provider:\s*(\S+)/m);
  const wsMatch = yaml.match(/^\s*workspace:\s*(\S+)/m);
  const gwMatch = yaml.match(/gateway:\s*\n\s*enabled:\s*(true|false)/);
  return {
    model: modelMatch ? modelMatch[1] : "",
    provider: providerMatch ? providerMatch[1] : "",
    workspace: wsMatch ? wsMatch[1] : "",
    gatewayEnabled: gwMatch ? gwMatch[1] === "true" : false,
  };
}

export function mergeConfigFields(original: string, fields: ConfigFields): string {
  let result = original;
  if (fields.model) result = result.replace(/^(\s*model:\s*)\S+/m, `$1${fields.model}`);
  if (fields.provider) result = result.replace(/^(\s*provider:\s*)\S+/m, `$1${fields.provider}`);
  if (fields.workspace) result = result.replace(/^(\s*workspace:\s*)\S+/m, `$1${fields.workspace}`);
  if (result.includes("gateway:")) {
    result = result.replace(/(gateway:\s*\n\s*enabled:\s*)(true|false)/, `$1${fields.gatewayEnabled}`);
  }
  return result;
}

export default function ConfigForm({
  fields,
  onChange,
}: {
  fields: ConfigFields;
  onChange: (fields: ConfigFields) => void;
}) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" fontWeight={600}>Basic Settings</Typography>
      <TextField
        label="Default Model"
        size="small"
        value={fields.model}
        onChange={(e) => onChange({ ...fields, model: e.target.value })}
        helperText="e.g. deepseek-v4-flash, claude-sonnet-4-6"
      />
      <TextField
        label="Provider"
        size="small"
        value={fields.provider}
        onChange={(e) => onChange({ ...fields, provider: e.target.value })}
        helperText="e.g. deepseek, anthropic, openai"
      />
      <TextField
        label="Workspace"
        size="small"
        value={fields.workspace}
        onChange={(e) => onChange({ ...fields, workspace: e.target.value })}
        helperText="Default working directory, e.g. ~ or /path/to/project"
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={fields.gatewayEnabled}
            onChange={(e) => onChange({ ...fields, gatewayEnabled: e.target.checked })}
          />
        }
        label={<Typography variant="body2">Gateway Enabled</Typography>}
      />
    </Stack>
  );
}

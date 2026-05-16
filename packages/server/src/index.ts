import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { createError, detectRuntime, readEditableFile, readProfile, scanProfiles, validateYaml } from "@hermes-hub/core";
import {
  ApiErrorCode,
  type ApiError,
  type ApiFailure,
  type ApiResponse,
  type EditableFileResult,
  type HealthCheckData,
  type ProfileDetail,
  type ProfilesListResponse,
  type RuntimeInfo,
  type ValidateFileRequest,
  type ValidateFileResponse,
} from "@hermes-hub/shared";

export type CreateHermesHubServerOptions = {
  version?: string;
  hermesHomeOverride?: string;
};

export class HermesHubHttpError extends Error {
  readonly statusCode: number;
  readonly apiError: ApiError;

  constructor(statusCode: number, apiError: ApiError) {
    super(apiError.message);
    this.name = "HermesHubHttpError";
    this.statusCode = statusCode;
    this.apiError = apiError;
  }
}

function success<T>(data: T): ApiResponse<T> {
  return {
    ok: true,
    data,
  };
}

function failure(error: ApiError): ApiFailure {
  return {
    ok: false,
    error,
  };
}

const webEntryPath = fileURLToPath(
  new URL("../../web/dist/index.js", import.meta.url),
);

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hermes Hub</title>
    <style>
      body {
        margin: 0;
        background: #f7f8f5;
        color: #20231f;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #app {
        max-width: 1180px;
        margin: 0 auto;
        padding: 28px;
      }
      button {
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

export function createHermesHubServer(
  options: CreateHermesHubServerOptions = {},
) {
  let runtimeCache: RuntimeInfo | undefined;

  const app = Fastify({
    logger: false,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HermesHubHttpError) {
      void reply.status(error.statusCode).send(failure(error.apiError));
      return;
    }

    const message = error instanceof Error ? error.message : String(error);

    void reply.status(500).send(
      failure({
        code: ApiErrorCode.UnknownError,
        message: "An unexpected error occurred.",
        details: {
          message,
        },
      }),
    );
  });

  app.get("/health", async (): Promise<ApiResponse<HealthCheckData>> =>
    success({
      name: "hermes-hub",
      version: options.version ?? "dev",
      timestamp: new Date().toISOString(),
    }),
  );

  app.get("/api/runtime", async (): Promise<ApiResponse<RuntimeInfo>> => {
    runtimeCache ??= await detectRuntime({
      hermesHomeOverride: options.hermesHomeOverride,
    });

    return success(runtimeCache);
  });

  app.post(
    "/api/runtime/rescan",
    async (): Promise<ApiResponse<RuntimeInfo>> => {
      runtimeCache = await detectRuntime({
        hermesHomeOverride: options.hermesHomeOverride,
      });

      return success(runtimeCache);
    },
  );

  app.get("/api/profiles", async (): Promise<ApiResponse<ProfilesListResponse>> => {
    runtimeCache ??= await detectRuntime({
      hermesHomeOverride: options.hermesHomeOverride,
    });

    return success(await scanProfiles(runtimeCache));
  });

  app.get(
    "/api/profiles/:id",
    async (request): Promise<ApiResponse<ProfileDetail>> => {
      runtimeCache ??= await detectRuntime({
        hermesHomeOverride: options.hermesHomeOverride,
      });

      const profile = await readProfile(
        runtimeCache,
        (request.params as { id: string }).id,
      );

      if (!profile) {
        throw new HermesHubHttpError(
          404,
          createError(
            ApiErrorCode.ProfileNotFound,
            "Profile not found",
            { profileId: (request.params as { id: string }).id },
            "Check that the profile exists under the current HERMES_HOME.",
          ),
        );
      }

      return success(profile);
    },
  );

  app.get(
    "/api/profiles/:id/config",
    async (request): Promise<ApiResponse<EditableFileResult>> => {
      runtimeCache ??= await detectRuntime({
        hermesHomeOverride: options.hermesHomeOverride,
      });

      const result = await readEditableFile(
        runtimeCache,
        (request.params as { id: string }).id,
        "config",
      );

      if (!result) {
        throw new HermesHubHttpError(
          404,
          createError(
            ApiErrorCode.ProfileNotFound,
            "Profile not found",
            { profileId: (request.params as { id: string }).id },
            "Check that the profile exists under the current HERMES_HOME.",
          ),
        );
      }

      return success(result);
    },
  );

  app.post(
    "/api/profiles/:id/config/validate",
    async (request): Promise<ApiResponse<ValidateFileResponse>> => {
      const { content } = (request.body ?? {}) as ValidateFileRequest;

      return success(validateYaml(content ?? ""));
    },
  );

  app.get("/", async (_request, reply) =>
    reply.type("text/html; charset=utf-8").send(indexHtml),
  );

  app.get("/assets/index.js", async (_request, reply) => {
    const script = await readFile(webEntryPath, "utf8");

    return reply.type("application/javascript; charset=utf-8").send(script);
  });

  return app;
}

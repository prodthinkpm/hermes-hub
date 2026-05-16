import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import Fastify from "fastify";
import { cloneProfile, createError, createProfile, detectRuntime, HermesHubCoreError, readEditableFile, readProfile, saveEditableFile, scanProfiles, validateYaml } from "@hermes-hub/core";
import {
  ApiErrorCode,
  type ApiError,
  type ApiFailure,
  type ApiResponse,
  type CloneProfileRequest,
  type CloneProfileResponse,
  type CreateProfileRequest,
  type CreateProfileResponse,
  type EditableFileResult,
  type HealthCheckData,
  type ProfileDetail,
  type ProfilesListResponse,
  type RuntimeInfo,
  type SaveFileRequest,
  type SaveFileResponse,
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

const webDistDir = fileURLToPath(new URL("../../web/dist", import.meta.url));

async function readWebIndex() {
  try {
    return await readFile(join(webDistDir, "index.html"), "utf8");
  } catch {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Hermes Hub</title></head><body><p>Web bundle not built. Run pnpm build first.</p></body></html>`;
  }
}

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

    if (error instanceof HermesHubCoreError) {
      const statusCode = error.apiError.code ===
        ApiErrorCode.HermesHomeNotFound ||
        error.apiError.code === ApiErrorCode.ProfileNotFound
        ? 404
        : 422;

      void reply.status(statusCode).send(failure(error.apiError));
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
        suggestion: "If this persists, check the Hermes Hub logs or report the issue.",
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

  app.post(
    "/api/profiles",
    async (request): Promise<ApiResponse<CreateProfileResponse>> => {
      runtimeCache ??= await detectRuntime({
        hermesHomeOverride: options.hermesHomeOverride,
      });

      const body = (request.body ?? {}) as CreateProfileRequest;

      return success(await createProfile(runtimeCache, body));
    },
  );

  app.post(
    "/api/profiles/:id/clone",
    async (request): Promise<ApiResponse<CloneProfileResponse>> => {
      runtimeCache ??= await detectRuntime({
        hermesHomeOverride: options.hermesHomeOverride,
      });

      const body = (request.body ?? {}) as CloneProfileRequest;
      body.sourceProfileId = (request.params as { id: string }).id;

      return success(await cloneProfile(runtimeCache, body));
    },
  );

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

  app.put(
    "/api/profiles/:id/config",
    async (request): Promise<ApiResponse<SaveFileResponse>> => {
      runtimeCache ??= await detectRuntime({
        hermesHomeOverride: options.hermesHomeOverride,
      });

      const { content } = (request.body ?? {}) as SaveFileRequest;

      return success(
        await saveEditableFile(
          runtimeCache,
          (request.params as { id: string }).id,
          "config",
          content ?? "",
        ),
      );
    },
  );

  app.get(
    "/api/profiles/:id/soul",
    async (request): Promise<ApiResponse<EditableFileResult>> => {
      runtimeCache ??= await detectRuntime({
        hermesHomeOverride: options.hermesHomeOverride,
      });

      const result = await readEditableFile(
        runtimeCache,
        (request.params as { id: string }).id,
        "soul",
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
    "/api/profiles/:id/soul/validate",
    async (request): Promise<ApiResponse<ValidateFileResponse>> => {
      const { content } = (request.body ?? {}) as ValidateFileRequest;
      const text = content ?? "";

      if (text.trim().length === 0) {
        return success({
          valid: false,
          errors: [
            createError(
              ApiErrorCode.ValidationError,
              "SOUL.md content is empty. Empty SOUL files are not recommended.",
              undefined,
              "Add identity and behaviour instructions to the SOUL.md file.",
            ),
          ],
          warnings: [],
        });
      }

      return success({ valid: true, errors: [], warnings: [] });
    },
  );

  app.put(
    "/api/profiles/:id/soul",
    async (request): Promise<ApiResponse<SaveFileResponse>> => {
      runtimeCache ??= await detectRuntime({
        hermesHomeOverride: options.hermesHomeOverride,
      });

      const { content } = (request.body ?? {}) as SaveFileRequest;

      return success(
        await saveEditableFile(
          runtimeCache,
          (request.params as { id: string }).id,
          "soul",
          content ?? "",
        ),
      );
    },
  );

  app.get("/", async (_request, reply) => {
    const html = await readWebIndex();

    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/assets/*", async (request, reply) => {
    const assetPath = join(webDistDir, "assets", (request.params as { "*": string })["*"]);

    try {
      const content = await readFile(assetPath);

      if (assetPath.endsWith(".js")) {
        return reply.type("application/javascript; charset=utf-8").send(content);
      }

      if (assetPath.endsWith(".css")) {
        return reply.type("text/css; charset=utf-8").send(content);
      }

      return reply.send(content);
    } catch {
      return reply.status(404).send("Not found");
    }
  });

  return app;
}

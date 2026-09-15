import type {
  OptimizedGraphSettings,
} from "../types";

export const DEFAULT_SETTINGS:
  OptimizedGraphSettings = {
  maxVisibleNodes:
    1000,

  maxLinksPerNode:
    25,

  ignoreAttachments:
    true,

  ignoredFolders:
    [],

  minimumConnectionCount:
    1,

  renderCurrentClusterOnly:
    false,

  physicsAutoPauseSeconds:
    3,

  resumePhysicsOnDrag:
    true,

  refreshDebounceSeconds:
    2,
};

export function normalizeIgnoredFolders(
  folders:
    string[],
): string[] {
  const normalized =
    folders
      .map(
        (folder) =>
          normalizeFolderPath(
            folder,
          ),
      )
      .filter(
        (folder) =>
          folder.length >
          0,
      );

  return Array.from(
    new Set(
      normalized,
    ),
  );
}

export function normalizeFolderPath(
  value:
    string,
): string {
  return value
    .trim()
    .replace(
      /\\/g,
      "/",
    )
    .replace(
      /^\/+/,
      "",
    )
    .replace(
      /\/+$/,
      "",
    );
}

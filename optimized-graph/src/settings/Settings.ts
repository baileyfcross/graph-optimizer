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

  /*
   * IMPORTANT:
   *
   * Keep the graph stationary unless the user explicitly
   * starts layout or performs an interaction configured to
   * resume it.
   */
  autoRunLayoutOnRefresh:
    false,

  physicsAutoPauseSeconds:
    3,

  resumePhysicsOnDrag:
    true,

  refreshDebounceSeconds:
    2,

  /*
   * Controlled from the Optimized Graph toolbar, not from the
   * plugin Settings page.
   *
   * 0 = no normal labels
   * 1 = all normal labels
   */
  labelVisibility:
    0.5,
};

export function normalizeLabelVisibility(
  value:
    number,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 0.5;
  }

  return Math.max(
    0,
    Math.min(
      1,
      value,
    ),
  );
}

export function legacyThresholdToLabelVisibility(
  threshold:
    number,
): number {
  if (
    !Number.isFinite(
      threshold,
    )
  ) {
    return 0.5;
  }

  return normalizeLabelVisibility(
    1 -
      (
        Math.max(
          0,
          Math.min(
            14,
            threshold,
          ),
        ) /
        14
      ),
  );
}

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

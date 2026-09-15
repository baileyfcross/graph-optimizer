import {
  Plugin,
  TFile,
  WorkspaceLeaf,
} from "obsidian";

import {
  OptimizedGraphView,
  VIEW_TYPE_OPTIMIZED_GRAPH,
} from "./OptimizedGraphView";

import {
  OptimizedGraphSettingTab,
} from "./settings/OptimizedGraphSettingTab";

import {
  DEFAULT_SETTINGS,
  normalizeIgnoredFolders,
} from "./settings/Settings";

import type {
  OptimizedGraphPluginData,
  OptimizedGraphSettings,
  SavedGraphPosition,
} from "./types";

export default class OptimizedGraphPlugin
  extends Plugin {
  settings:
    OptimizedGraphSettings = {
      ...DEFAULT_SETTINGS,
    };

  private positions:
    Record<
      string,
      SavedGraphPosition
    > = {};

  private lastActiveMarkdownPath:
    string |
    null =
    null;

  private saveTimer:
    number |
    null =
    null;

  async onload():
    Promise<void> {
    await this.loadPluginData();

    const activeFile =
      this.app.workspace
        .getActiveFile();

    if (
      activeFile?.extension
        .toLowerCase() ===
      "md"
    ) {
      this.lastActiveMarkdownPath =
        activeFile.path;
    }

    this.registerView(
      VIEW_TYPE_OPTIMIZED_GRAPH,

      (
        leaf,
      ) =>
        new OptimizedGraphView(
          leaf,
          this,
        ),
    );

    this.addRibbonIcon(
      "git-fork",
      "Open Optimized Graph",

      () => {
        void this.activateView();
      },
    );

    this.addCommand({
      id:
        "open-optimized-graph",

      name:
        "Open Optimized Graph",

      callback:
        () => {
          void this.activateView();
        },
    });

    this.addSettingTab(
      new OptimizedGraphSettingTab(
        this.app,
        this,
      ),
    );

    this.registerEvent(
      this.app.workspace.on(
        "file-open",
        (
          file,
        ) => {
          if (
            file instanceof
              TFile &&
            file.extension
              .toLowerCase() ===
              "md"
          ) {
            this.lastActiveMarkdownPath =
              file.path;

            this.notifyClusterRootChanged();
          }
        },
      ),
    );
  }

  onunload():
    void {
    if (
      this.saveTimer !==
      null
    ) {
      window.clearTimeout(
        this.saveTimer,
      );

      this.saveTimer =
        null;
    }

    void this.persistData();
  }

  async activateView():
    Promise<void> {
    let leaf:
      WorkspaceLeaf |
      null =
      this.app.workspace
        .getLeavesOfType(
          VIEW_TYPE_OPTIMIZED_GRAPH,
        )[0] ??
        null;

    if (
      !leaf
    ) {
      leaf =
        this.app.workspace
          .getLeaf(
            "tab",
          );

      await leaf
        .setViewState({
          type:
            VIEW_TYPE_OPTIMIZED_GRAPH,

          active:
            true,
        });
    }

    await this.app.workspace
      .revealLeaf(
        leaf,
      );
  }

  getLastActiveMarkdownPath():
    string | null {
    return this
      .lastActiveMarkdownPath;
  }

  getSavedPosition(
    path:
      string,
  ): SavedGraphPosition |
    null {
    const position =
      this.positions[
        path
      ];

    if (
      !position ||
      !Number.isFinite(
        position.x,
      ) ||
      !Number.isFinite(
        position.y,
      )
    ) {
      return null;
    }

    return {
      x:
        position.x,

      y:
        position.y,
    };
  }

  cachePositions(
    updates:
      Record<
        string,
        SavedGraphPosition
      >,
  ): void {
    Object.assign(
      this.positions,
      updates,
    );

    this.scheduleDataSave();
  }

  async clearSavedPositions():
    Promise<void> {
    this.positions = {};

    await this.persistData();
  }

  async saveSettingsAndRefresh():
    Promise<void> {
    this.settings
      .ignoredFolders =
      normalizeIgnoredFolders(
        this.settings
          .ignoredFolders,
      );

    await this.persistData();

    this.refreshOpenViews(
      true,
    );
  }

  refreshOpenViews(
    immediate:
      boolean,
  ): void {
    for (
      const leaf of
      this.app.workspace
        .getLeavesOfType(
          VIEW_TYPE_OPTIMIZED_GRAPH,
        )
    ) {
      if (
        leaf.view instanceof
        OptimizedGraphView
      ) {
        leaf.view
          .requestSettingsRefresh();
      }
    }
  }

  private notifyClusterRootChanged():
    void {
    if (
      !this.settings
        .renderCurrentClusterOnly
    ) {
      return;
    }

    for (
      const leaf of
      this.app.workspace
        .getLeavesOfType(
          VIEW_TYPE_OPTIMIZED_GRAPH,
        )
    ) {
      if (
        leaf.view instanceof
        OptimizedGraphView
      ) {
        leaf.view
          .requestClusterRootRefresh();
      }
    }
  }

  private async loadPluginData():
    Promise<void> {
    const data =
      (
        await this.loadData()
      ) as
        OptimizedGraphPluginData |
        null;

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(
        data?.settings ??
        {}
      ),
    };

    this.settings
      .ignoredFolders =
      normalizeIgnoredFolders(
        this.settings
          .ignoredFolders ??
          [],
      );

    this.positions = {
      ...(
        data?.positions ??
        {}
      ),
    };
  }

  private scheduleDataSave():
    void {
    if (
      this.saveTimer !==
      null
    ) {
      window.clearTimeout(
        this.saveTimer,
      );
    }

    this.saveTimer =
      window.setTimeout(
        () => {
          this.saveTimer =
            null;

          void this.persistData();
        },
        800,
      );
  }

  private async persistData():
    Promise<void> {
    const data:
      OptimizedGraphPluginData = {
      settings:
        this.settings,

      positions:
        this.positions,
    };

    await this.saveData(
      data,
    );
  }
}

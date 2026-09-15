import {
  App,
  PluginSettingTab,
  Setting,
} from "obsidian";

import type OptimizedGraphPlugin
  from "../main";

import {
  normalizeIgnoredFolders,
} from "./Settings";

export class OptimizedGraphSettingTab
  extends PluginSettingTab {
  constructor(
    app:
      App,

    private readonly plugin:
      OptimizedGraphPlugin,
  ) {
    super(
      app,
      plugin,
    );
  }

  display():
    void {
    const {
      containerEl,
    } = this;

    containerEl.empty();

    new Setting(
      containerEl,
    )
      .setName(
        "Rendering limits",
      )
      .setHeading();

    new Setting(
      containerEl,
    )
      .setName(
        "Maximum visible nodes",
      )
      .setDesc(
        "Hard cap on rendered graph nodes. Lower values are faster and reduce layout work.",
      )
      .addDropdown(
        (dropdown) =>
          dropdown
            .addOption(
              "500",
              "500 — fastest",
            )
            .addOption(
              "1000",
              "1,000 — recommended",
            )
            .addOption(
              "2000",
              "2,000 — large graph",
            )
            .setValue(
              String(
                this.plugin
                  .settings
                  .maxVisibleNodes,
              ),
            )
            .onChange(
              async (
                value,
              ) => {
                this.plugin
                  .settings
                  .maxVisibleNodes =
                    Number(
                      value,
                    ) as
                      500 |
                      1000 |
                      2000;

                await this.plugin
                  .saveSettingsAndRefresh();
              },
            ),
      );

    new Setting(
      containerEl,
    )
      .setName(
        "Maximum links per node",
      )
      .setDesc(
        "Greedily keeps the strongest links while preventing high-degree hub notes from producing extremely dense scenes.",
      )
      .addDropdown(
        (dropdown) =>
          dropdown
            .addOption(
              "10",
              "10 — fastest",
            )
            .addOption(
              "25",
              "25 — recommended",
            )
            .addOption(
              "50",
              "50 — dense",
            )
            .setValue(
              String(
                this.plugin
                  .settings
                  .maxLinksPerNode,
              ),
            )
            .onChange(
              async (
                value,
              ) => {
                this.plugin
                  .settings
                  .maxLinksPerNode =
                    Number(
                      value,
                    ) as
                      10 |
                      25 |
                      50;

                await this.plugin
                  .saveSettingsAndRefresh();
              },
            ),
      );

    new Setting(
      containerEl,
    )
      .setName(
        "Minimum connection count",
      )
      .setDesc(
        "Hide low-connectivity files. The current cluster root is retained even when it is below this threshold.",
      )
      .addSlider(
        (slider) =>
          slider
            .setLimits(
              0,
              20,
              1,
            )
            .setDynamicTooltip()
            .setValue(
              this.plugin
                .settings
                .minimumConnectionCount,
            )
            .onChange(
              async (
                value,
              ) => {
                this.plugin
                  .settings
                  .minimumConnectionCount =
                    value;

                await this.plugin
                  .saveSettingsAndRefresh();
              },
            ),
      );

    new Setting(
      containerEl,
    )
      .setName(
        "Filtering",
      )
      .setHeading();

    new Setting(
      containerEl,
    )
      .setName(
        "Ignore attachment nodes",
      )
      .setDesc(
        "When enabled, only Markdown files are eligible graph nodes. Images, PDFs, audio, and other attachments are excluded.",
      )
      .addToggle(
        (toggle) =>
          toggle
            .setValue(
              this.plugin
                .settings
                .ignoreAttachments,
            )
            .onChange(
              async (
                value,
              ) => {
                this.plugin
                  .settings
                  .ignoreAttachments =
                    value;

                await this.plugin
                  .saveSettingsAndRefresh();
              },
            ),
      );

    new Setting(
      containerEl,
    )
      .setName(
        "Ignored folders",
      )
      .setDesc(
        "One vault-relative folder per line. All files below these folders are excluded. Example: 2 - Source Material",
      )
      .addTextArea(
        (textArea) => {
          textArea
            .setPlaceholder(
              "2 - Source Material\nAttachments\nArchive",
            )
            .setValue(
              this.plugin
                .settings
                .ignoredFolders
                .join(
                  "\n",
                ),
            )
            .onChange(
              async (
                value,
              ) => {
                const raw =
                  value
                    .split(
                      /[\n,]+/,
                    );

                this.plugin
                  .settings
                  .ignoredFolders =
                    normalizeIgnoredFolders(
                      raw,
                    );

                await this.plugin
                  .saveSettingsAndRefresh();
              },
            );

          textArea
            .inputEl
            .rows =
            6;
        },
      );

    new Setting(
      containerEl,
    )
      .setName(
        "Render only current cluster",
      )
      .setDesc(
        "Show only the connected component containing the most recently active Markdown note. This is usually much faster than a global graph.",
      )
      .addToggle(
        (toggle) =>
          toggle
            .setValue(
              this.plugin
                .settings
                .renderCurrentClusterOnly,
            )
            .onChange(
              async (
                value,
              ) => {
                this.plugin
                  .settings
                  .renderCurrentClusterOnly =
                    value;

                await this.plugin
                  .saveSettingsAndRefresh();
              },
            ),
      );

    new Setting(
      containerEl,
    )
      .setName(
        "Physics",
      )
      .setHeading();

    new Setting(
      containerEl,
    )
      .setName(
        "Pause physics automatically",
      )
      .setDesc(
        "ForceAtlas2 runs in a Web Worker and stops automatically after this many seconds so it does not continuously consume CPU.",
      )
      .addDropdown(
        (dropdown) =>
          dropdown
            .addOption(
              "1",
              "After 1 second",
            )
            .addOption(
              "2",
              "After 2 seconds",
            )
            .addOption(
              "3",
              "After 3 seconds — recommended",
            )
            .addOption(
              "5",
              "After 5 seconds",
            )
            .setValue(
              String(
                this.plugin
                  .settings
                  .physicsAutoPauseSeconds,
              ),
            )
            .onChange(
              async (
                value,
              ) => {
                this.plugin
                  .settings
                  .physicsAutoPauseSeconds =
                    Number(
                      value,
                    ) as
                      1 |
                      2 |
                      3 |
                      5;

                await this.plugin
                  .saveSettingsAndRefresh();
              },
            ),
      );

    new Setting(
      containerEl,
    )
      .setName(
        "Resume physics after node drag",
      )
      .setDesc(
        "Dragging a node temporarily pins it. When released, the layout runs again for the configured auto-pause window.",
      )
      .addToggle(
        (toggle) =>
          toggle
            .setValue(
              this.plugin
                .settings
                .resumePhysicsOnDrag,
            )
            .onChange(
              async (
                value,
              ) => {
                this.plugin
                  .settings
                  .resumePhysicsOnDrag =
                    value;

                await this.plugin
                  .saveSettingsAndRefresh();
              },
            ),
      );

    new Setting(
      containerEl,
    )
      .setName(
        "Refresh debounce",
      )
      .setDesc(
        "Wait after metadata/vault changes before rebuilding. Longer values reduce repeated rebuilds during bursts of edits.",
      )
      .addDropdown(
        (dropdown) =>
          dropdown
            .addOption(
              "1",
              "1 second",
            )
            .addOption(
              "2",
              "2 seconds — recommended",
            )
            .addOption(
              "3",
              "3 seconds",
            )
            .addOption(
              "5",
              "5 seconds",
            )
            .setValue(
              String(
                this.plugin
                  .settings
                  .refreshDebounceSeconds,
              ),
            )
            .onChange(
              async (
                value,
              ) => {
                this.plugin
                  .settings
                  .refreshDebounceSeconds =
                    Number(
                      value,
                    ) as
                      1 |
                      2 |
                      3 |
                      5;

                await this.plugin
                  .saveSettingsAndRefresh();
              },
            ),
      );

    new Setting(
      containerEl,
    )
      .setName(
        "Cached positions",
      )
      .setHeading();

    new Setting(
      containerEl,
    )
      .setName(
        "Reset cached node positions",
      )
      .setDesc(
        "Forget saved graph coordinates and allow the next layout run to start from deterministic seed positions.",
      )
      .addButton(
        (button) =>
          button
            .setButtonText(
              "Reset positions",
            )
            .onClick(
              async () => {
                await this.plugin
                  .clearSavedPositions();

                this.plugin
                  .refreshOpenViews(
                    true,
                  );
              },
            ),
      );
  }
}

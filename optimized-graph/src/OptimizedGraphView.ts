import {
  ItemView,
  TFile,
  WorkspaceLeaf,
} from "obsidian";

import Graph
  from "graphology";

import Sigma
  from "sigma";

import type OptimizedGraphPlugin
  from "./main";

import {
  GraphDataBuilder,
} from "./GraphDataBuilder";

import {
  GraphPhysicsController,
} from "./GraphPhysicsController";

import type {
  GraphSnapshot,
  SavedGraphPosition,
} from "./types";

export const VIEW_TYPE_OPTIMIZED_GRAPH =
  "optimized-graph-view";

interface StoredCameraState {
  x: number;
  y: number;
  angle: number;
  ratio: number;
}

interface GraphBounds {
  x:
    [
      number,
      number,
    ];

  y:
    [
      number,
      number,
    ];
}

export class OptimizedGraphView
  extends ItemView {
  private readonly builder:
    GraphDataBuilder;

  private graph:
    Graph |
    null =
    null;

  private renderer:
    Sigma |
    null =
    null;

  private physics:
    GraphPhysicsController |
    null =
    null;

  private graphEl:
    HTMLElement |
    null =
    null;

  private statusEl:
    HTMLElement |
    null =
    null;

  private layoutButton:
    HTMLButtonElement |
    null =
    null;

  private labelPruningSlider:
    HTMLInputElement |
    null =
    null;

  private labelPruningValueEl:
    HTMLElement |
    null =
    null;

  private refreshTimer:
    number |
    null =
    null;

  private buildGeneration =
    0;

  private draggedNode:
    string |
    null =
    null;

  private isDragging =
    false;

  private dirtyWhileHidden =
    false;

  /*
   * Lightweight hover focus overlay.
   *
   * The graph itself remains WebGL-rendered. Hover focus is a
   * single DOM node layered above the canvas, so we do not run
   * nodeReducer/edgeReducer across the entire graph.
   */
  private hoverOverlayEl:
    HTMLElement |
    null =
    null;

  private hoverNodeEl:
    HTMLElement |
    null =
    null;

  private hoverLabelEl:
    HTMLElement |
    null =
    null;

  private hoveredNodeId:
    string |
    null =
    null;

  private labelForceMode:
    "none" |
    "normal" |
    "all" |
    null =
    null;

  /*
   * View-local camera state survives graph rebuilds so a
   * metadata refresh does not pan/zoom the user elsewhere.
   */
  private cameraState:
    StoredCameraState |
    null =
    null;

  constructor(
    leaf:
      WorkspaceLeaf,

    private readonly plugin:
      OptimizedGraphPlugin,
  ) {
    super(
      leaf,
    );

    this.builder =
      new GraphDataBuilder(
        this.app,
      );
  }

  getViewType():
    string {
    return VIEW_TYPE_OPTIMIZED_GRAPH;
  }

  getDisplayText():
    string {
    return "Optimized Graph";
  }

  async onOpen():
    Promise<void> {
    this.contentEl.empty();

    this.contentEl
      .addClass(
        "optimized-graph-view",
      );

    this.createShell();

    /*
     * Link correctness:
     *
     * MetadataCache.changed can fire before resolvedLinks has
     * finished resolving the updated file graph.
     *
     * The graph is based on resolvedLinks, so rebuild after the
     * cache's "resolved" event instead. Obsidian documents this
     * event as firing after all files have been resolved.
     */
    this.registerEvent(
      this.app
        .metadataCache
        .on(
          "resolved",
          () => {
            this.scheduleRefresh();
          },
        ),
    );

    this.registerEvent(
      this.app.vault.on(
        "create",
        () => {
          this.scheduleRefresh();
        },
      ),
    );

    this.registerEvent(
      this.app.vault.on(
        "delete",
        () => {
          this.scheduleRefresh();
        },
      ),
    );

    this.registerEvent(
      this.app.vault.on(
        "rename",
        () => {
          this.scheduleRefresh();
        },
      ),
    );

    this.registerEvent(
      this.app.workspace.on(
        "active-leaf-change",
        () => {
          if (
            this.plugin
              .settings
              .renderCurrentClusterOnly
          ) {
            this.scheduleRefresh();
          }

          if (
            this.dirtyWhileHidden &&
            this.isVisible()
          ) {
            this.dirtyWhileHidden =
              false;

            void this.rebuild(
              false,
            );
          }
        },
      ),
    );

    await this.rebuild(
      false,
    );
  }

  async onClose():
    Promise<void> {
    this.clearRefreshTimer();

    this.capturePositions();
    this.captureCameraState();

    this.destroyRenderer();
  }

  requestSettingsRefresh():
    void {
    this.scheduleRefresh(
      true,
    );
  }

  requestClusterRootRefresh():
    void {
    if (
      !this.plugin
        .settings
        .renderCurrentClusterOnly
    ) {
      return;
    }

    this.scheduleRefresh();
  }

  private createShell():
    void {
    const toolbar =
      this.contentEl.createDiv({
        cls:
          "optimized-graph-toolbar",
      });

    const refreshSlot =
      toolbar.createDiv({
        cls:
          "optimized-graph-toolbar-slot optimized-graph-toolbar-slot-refresh",
      });

    const refreshButton =
      refreshSlot.createEl(
        "button",
        {
          cls:
            "optimized-graph-toolbar-button",
          text:
            "Refresh",
        },
      );

    refreshButton.addEventListener(
      "click",
      () => {
        void this.rebuild(
          true,
        );
      },
    );

    const fitSlot =
      toolbar.createDiv({
        cls:
          "optimized-graph-toolbar-slot optimized-graph-toolbar-slot-fit",
      });

    const fitButton =
      fitSlot.createEl(
        "button",
        {
          cls:
            "optimized-graph-toolbar-button",
          text:
            "Fit",
        },
      );

    fitButton.addEventListener(
      "click",
      () => {
        void this.fitGraph();
      },
    );

    const layoutSlot =
      toolbar.createDiv({
        cls:
          "optimized-graph-toolbar-slot optimized-graph-toolbar-slot-layout",
      });

    this.layoutButton =
      layoutSlot.createEl(
        "button",
        {
          cls:
            "optimized-graph-toolbar-button optimized-graph-toolbar-button-layout",
          text:
            "Run layout",
        },
      );

    this.layoutButton
      .addEventListener(
        "click",
        () => {
          if (
            this.physics
              ?.isRunning()
          ) {
            this.physics.stop();
          } else {
            this.startPhysics();
          }
        },
      );

    const labelControl =
      toolbar.createDiv({
        cls:
          "optimized-graph-toolbar-slot optimized-graph-toolbar-slot-pruning",
      });

    const pruningHeader =
      labelControl.createDiv({
        cls:
          "optimized-graph-pruning-header",
      });

    pruningHeader.createSpan({
      cls:
        "optimized-graph-toolbar-control-label",
      text:
        "Label pruning",
    });

    this.labelPruningValueEl =
      pruningHeader.createSpan({
        cls:
          "optimized-graph-pruning-value",
      });

    const initialVisibility =
      this.clampLabelVisibility(
        this.plugin
          .settings
          .labelVisibility,
      );

    this.labelPruningValueEl
      .setText(
        initialVisibility
          .toFixed(
            2,
          ),
      );

    this.labelPruningSlider =
      labelControl.createEl(
        "input",
        {
          cls:
            "optimized-graph-pruning-slider",
          attr: {
            type:
              "range",
            min:
              "0",
            max:
              "1",
            step:
              "0.01",
            value:
              initialVisibility
                .toFixed(
                  2,
                ),
            "aria-label":
              "Label visibility",
            title:
              "0 hides all normal node labels. 1 shows all normal node labels.",
          },
        },
      );

    const pruningScale =
      labelControl.createDiv({
        cls:
          "optimized-graph-pruning-scale",
      });

    pruningScale.createSpan({
      text:
        "0",
    });

    pruningScale.createSpan({
      text:
        "1",
    });

    const applyLabelVisibilityFromSlider =
      (
        persist:
          boolean,
      ): void => {
        if (
          !this.labelPruningSlider ||
          !this.labelPruningValueEl
        ) {
          return;
        }

        const visibility =
          this.clampLabelVisibility(
            Number(
              this.labelPruningSlider
                .value,
            ),
          );

        this.labelPruningValueEl
          .setText(
            visibility
              .toFixed(
                2,
              ),
          );

        this.plugin
          .settings
          .labelVisibility =
            visibility;

        this.applyLabelVisibility(
          visibility,
        );

        if (
          persist
        ) {
          void this.plugin
            .saveViewPreferences();
        }
      };

    this.labelPruningSlider
      .addEventListener(
        "input",
        () => {
          applyLabelVisibilityFromSlider(
            false,
          );
        },
      );

    this.labelPruningSlider
      .addEventListener(
        "change",
        () => {
          applyLabelVisibilityFromSlider(
            true,
          );
        },
      );

    this.contentEl.createDiv({
      cls:
        "optimized-graph-info-window",
      text:
        "The graph is static by default. Run layout only when you want nodes rearranged.",
    });

    this.statusEl =
      this.contentEl.createDiv({
        cls:
          "optimized-graph-status",
        text:
          "Preparing graph…",
      });

    this.graphEl =
      this.contentEl.createDiv({
        cls:
          "optimized-graph-canvas",
      });

    this.hoverOverlayEl =
      this.graphEl.createDiv({
        cls:
          "optimized-graph-hover-overlay",
      });

    this.hoverNodeEl =
      this.hoverOverlayEl.createDiv({
        cls:
          "optimized-graph-hover-node",
      });

    this.hoverLabelEl =
      this.hoverOverlayEl.createDiv({
        cls:
          "optimized-graph-hover-label",
      });

    this.clearHoverFocus();
  }

  private scheduleRefresh(
    immediate =
      false,
  ): void {
    if (
      !this.isVisible()
    ) {
      this.dirtyWhileHidden =
        true;
      return;
    }

    this.clearRefreshTimer();

    const delay =
      immediate
        ? 0
        : this.plugin
            .settings
            .refreshDebounceSeconds *
          1000;

    this.refreshTimer =
      window.setTimeout(
        () => {
          this.refreshTimer =
            null;

          void this.rebuild(
            false,
          );
        },
        delay,
      );
  }

  private clearRefreshTimer():
    void {
    if (
      this.refreshTimer ===
      null
    ) {
      return;
    }

    window.clearTimeout(
      this.refreshTimer,
    );

    this.refreshTimer =
      null;
  }

  private async rebuild(
    manual:
      boolean,
  ): Promise<void> {
    if (
      !this.graphEl ||
      !this.statusEl
    ) {
      return;
    }

    const generation =
      ++this.buildGeneration;

    this.statusEl.setText(
      manual
        ? "Refreshing graph…"
        : "Building optimized graph…",
    );

    await new Promise<void>(
      (resolve) => {
        window.requestAnimationFrame(
          () => {
            resolve();
          },
        );
      },
    );

    if (
      generation !==
      this.buildGeneration
    ) {
      return;
    }

    /*
     * Preserve both world positions and the user's current
     * camera before replacing the renderer.
     */
    this.capturePositions();
    this.captureCameraState();

    this.destroyRenderer();

    const currentFilePath =
      this.plugin
        .getLastActiveMarkdownPath();

    const snapshot =
      this.builder.build(
        this.plugin
          .settings,
        currentFilePath,
      );

    if (
      generation !==
      this.buildGeneration
    ) {
      return;
    }

    this.renderSnapshot(
      snapshot,
      currentFilePath,
    );
  }

  private renderSnapshot(
    snapshot:
      GraphSnapshot,

    currentFilePath:
      string | null,
  ): void {
    if (
      !this.graphEl ||
      !this.statusEl
    ) {
      return;
    }

    this.graphEl.empty();

    this.recreateHoverOverlay();

    if (
      snapshot.nodes.length ===
      0
    ) {
      this.graphEl.createDiv({
        cls:
          "optimized-graph-empty",
        text:
          snapshot
            .stats
            .clusterRootMissing
            ? "Current-cluster mode is enabled, but no recent Markdown note is available as the cluster root."
            : "No nodes match the current Optimized Graph filters.",
      });

      this.updateStatus(
        snapshot,
        false,
      );

      return;
    }

    const graph =
      new Graph({
        type:
          "undirected",

        multi:
          false,

        allowSelfLoops:
          false,
      });

    const colors =
      this.readThemeColors();

    for (
      const node of
      snapshot.nodes
    ) {
      const saved =
        this.plugin
          .getSavedPosition(
            node.path,
          );

      const seeded =
        saved ??
        this.seedPosition(
          node.path,
        );

      const isCurrent =
        node.path ===
        currentFilePath;

      graph.addNode(
        node.id,
        {
          x:
            seeded.x,

          y:
            seeded.y,

          label:
            node.label,

          path:
            node.path,

          degree:
            node.degree,

          size:
            2 +
            Math.min(
              8,
              Math.sqrt(
                node.degree +
                1,
              ) *
                1.35,
            ),

          color:
            isCurrent
              ? colors.accent
              : node.isAttachment
                ? colors.attachment
                : colors.node,

          isCurrent,

          forceLabel:
            this.forceLabelForVisibility(
              this.plugin
                .settings
                .labelVisibility,
              isCurrent,
            ),

          zIndex:
            isCurrent
              ? 10
              : 1,
        },
      );
    }

    for (
      const edge of
      snapshot.edges
    ) {
      if (
        !graph.hasNode(
          edge.source,
        ) ||
        !graph.hasNode(
          edge.target,
        )
      ) {
        continue;
      }

      graph.addEdgeWithKey(
        edge.id,
        edge.source,
        edge.target,
        {
          weight:
            edge.weight,

          size:
            Math.max(
              0.5,
              Math.min(
                3,
                Math.sqrt(
                  edge.weight,
                ),
              ),
            ),

          color:
            colors.edge,
        },
      );
    }

    this.graph =
      graph;

    this.labelForceMode =
      this.labelForceModeForVisibility(
        this.plugin
          .settings
          .labelVisibility,
      );

    const renderer =
      new Sigma(
        graph,
        this.graphEl,
        {
          renderLabels:
            true,

          renderEdgeLabels:
            false,

          enableEdgeEvents:
            false,

          /*
           * Preserve zoom-based label pruning, but do not hide
           * labels merely because the camera is moving.
           *
           * This produces the intended behavior:
           *
           *   zoomed out
           *     -> labels are aggressively pruned
           *
           *   zoom in until a label becomes eligible
           *     -> the label appears
           *
           *   pan / drag around at that zoom level
           *     -> the label remains visible
           */
          hideEdgesOnMove:
            true,

          hideLabelsOnMove:
            false,

          /*
           * Continuous 0..1 label visibility.
           *
           * 0:
           *   hide all normal node labels
           *
           * 0.5:
           *   approximately the previous Normal behavior
           *
           * 1:
           *   every normal node label is force-enabled
           */
          labelDensity:
            this.labelDensityForVisibility(
              this.plugin
                .settings
                .labelVisibility,
            ),

          labelGridCellSize:
            this.labelGridCellSizeForVisibility(
              this.plugin
                .settings
                .labelVisibility,
            ),

          labelRenderedSizeThreshold:
            this.labelThresholdForVisibility(
              this.plugin
                .settings
                .labelVisibility,
            ),

          labelColor: {
            color:
              colors.label,
          },

          defaultNodeColor:
            colors.node,

          defaultEdgeColor:
            colors.edge,

          zIndex:
            true,

          stagePadding:
            30,

          allowInvalidContainer:
            true,
        },
      );

    this.renderer =
      renderer;

    /*
     * Sigma v3 normally derives normalization from the live
     * graph bounds. Force-layout changes or incremental node
     * additions can therefore make the entire scene appear to
     * breathe/zoom even when the user did nothing.
     *
     * Freeze a padded bounding box after render. Node positions
     * can still change when the user explicitly runs layout,
     * but the camera frame itself remains stable.
     */
    this.freezeCurrentBounds(
      renderer,
    );

    if (
      this.cameraState
    ) {
      renderer
        .getCamera()
        .setState(
          this.cameraState,
        );
    }

    this.installInteractions(
      renderer,
      graph,
    );

    this.physics =
      new GraphPhysicsController(
        graph,

        (
          running,
        ) => {
          this.updateLayoutButton(
            running,
          );

          this.updateStatus(
            snapshot,
            running,
          );
        },

        () => {
          window.setTimeout(
            () => {
              this.capturePositions();
            },
            50,
          );
        },
      );

    this.updateStatus(
      snapshot,
      false,
    );

    /*
     * Static is now the default.
     *
     * Layout starts automatically only when the user has
     * explicitly enabled that behavior in settings.
     */
    if (
      this.plugin
        .settings
        .autoRunLayoutOnRefresh
    ) {
      this.startPhysics();
    }
  }

  private installInteractions(
    renderer:
      Sigma,

    graph:
      Graph,
  ): void {
    renderer.on(
      "doubleClickNode",
      ({
        node,
        event,
      }) => {
        event
          .preventSigmaDefault();

        void this.openNode(
          node,
        );
      },
    );

    renderer.on(
      "enterNode",
      ({
        node,
      }) => {
        this.showHoverFocus(
          renderer,
          graph,
          node,
        );

        if (
          this.graphEl
        ) {
          this.graphEl
            .style
            .cursor =
            "pointer";
        }

        const path =
          String(
            graph.getNodeAttribute(
              node,
              "path",
            ) ??
            node,
          );

        if (
          this.statusEl
        ) {
          this.statusEl.title =
            path;
        }
      },
    );

    renderer.on(
      "leaveNode",
      () => {
        this.clearHoverFocus();

        if (
          this.graphEl
        ) {
          this.graphEl
            .style
            .cursor =
            "";
        }

        if (
          this.statusEl
        ) {
          this.statusEl.title =
            "";
        }
      },
    );

    renderer.on(
      "downNode",
      ({
        node,
      }) => {
        this.clearHoverFocus();

        this.isDragging =
          true;

        this.draggedNode =
          node;

        this.physics?.stop();

        graph.setNodeAttribute(
          node,
          "highlighted",
          true,
        );

        renderer
          .getCamera()
          .disable();
      },
    );

    const mouseCaptor =
      renderer
        .getMouseCaptor();

    mouseCaptor.on(
      "mousedown",
      () => {
        if (
          !renderer
            .getCustomBBox()
        ) {
          this.freezeCurrentBounds(
            renderer,
          );
        }
      },
    );

    mouseCaptor.on(
      "mousemovebody",
      (
        event,
      ) => {
        if (
          !this.isDragging ||
          !this.draggedNode
        ) {
          return;
        }

        const position =
          renderer
            .viewportToGraph(
              event,
            );

        graph.mergeNodeAttributes(
          this.draggedNode,
          {
            x:
              position.x,

            y:
              position.y,
          },
        );

        event
          .preventSigmaDefault();
      },
    );

    mouseCaptor.on(
      "mouseup",
      () => {
        const dragged =
          this.draggedNode;

        if (
          dragged &&
          graph.hasNode(
            dragged,
          )
        ) {
          graph.removeNodeAttribute(
            dragged,
            "highlighted",
          );
        }

        this.isDragging =
          false;

        this.draggedNode =
          null;

        renderer
          .getCamera()
          .enable();

        this.capturePositions();
        this.captureCameraState();

        if (
          this.plugin
            .settings
            .resumePhysicsOnDrag
        ) {
          this.startPhysics();
        }
      },
    );
  }

  private clampLabelVisibility(
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

  private labelThresholdForVisibility(
    value:
      number,
  ): number {
    const visibility =
      this.clampLabelVisibility(
        value,
      );

    if (
      visibility <=
      0
    ) {
      return 1_000_000;
    }

    if (
      visibility >=
      1
    ) {
      return 0;
    }

    /*
     * 0.5 -> 7, matching the previous Normal threshold.
     */
    return (
      14 *
      (
        1 -
        visibility
      )
    );
  }

  private labelDensityForVisibility(
    value:
      number,
  ): number {
    const visibility =
      this.clampLabelVisibility(
        value,
      );

    if (
      visibility <=
      0
    ) {
      return 0;
    }

    if (
      visibility >=
      1
    ) {
      return 1;
    }

    /*
     * 0.5 -> 0.45, matching the previous default.
     */
    return (
      0.1 +
      (
        visibility *
        0.7
      )
    );
  }

  private labelGridCellSizeForVisibility(
    value:
      number,
  ): number {
    const visibility =
      this.clampLabelVisibility(
        value,
      );

    /*
     * 0.5 -> 120, matching the previous default.
     */
    return (
      160 -
      (
        visibility *
        80
      )
    );
  }

  private labelForceModeForVisibility(
    value:
      number,
  ):
    "none" |
    "normal" |
    "all" {
    const visibility =
      this.clampLabelVisibility(
        value,
      );

    if (
      visibility <=
      0
    ) {
      return "none";
    }

    if (
      visibility >=
      1
    ) {
      return "all";
    }

    return "normal";
  }

  private forceLabelForVisibility(
    value:
      number,

    isCurrent:
      boolean,
  ): boolean {
    const mode =
      this.labelForceModeForVisibility(
        value,
      );

    if (
      mode ===
      "none"
    ) {
      return false;
    }

    if (
      mode ===
      "all"
    ) {
      return true;
    }

    return isCurrent;
  }

  private applyLabelVisibility(
    value:
      number,
  ): void {
    const visibility =
      this.clampLabelVisibility(
        value,
      );

    const renderer =
      this.renderer;

    const graph =
      this.graph;

    if (
      renderer
    ) {
      renderer.setSetting(
        "labelRenderedSizeThreshold",
        this.labelThresholdForVisibility(
          visibility,
        ),
      );

      renderer.setSetting(
        "labelDensity",
        this.labelDensityForVisibility(
          visibility,
        ),
      );

      renderer.setSetting(
        "labelGridCellSize",
        this.labelGridCellSizeForVisibility(
          visibility,
        ),
      );
    }

    const nextForceMode =
      this.labelForceModeForVisibility(
        visibility,
      );

    /*
     * Avoid walking every node on each 0.01 slider movement.
     * A full forceLabel update is necessary only when crossing
     * into or out of an endpoint mode.
     */
    if (
      graph &&
      nextForceMode !==
        this.labelForceMode
    ) {
      graph.forEachNode(
        (
          node,
          attributes,
        ) => {
          graph.setNodeAttribute(
            node,
            "forceLabel",
            this.forceLabelForVisibility(
              visibility,
              Boolean(
                attributes
                  .isCurrent,
              ),
            ),
          );
        },
      );

      this.labelForceMode =
        nextForceMode;
    }

    renderer?.refresh();
  }

  private recreateHoverOverlay():
    void {
    if (
      !this.graphEl
    ) {
      return;
    }

    this.hoverOverlayEl =
      this.graphEl.createDiv({
        cls:
          "optimized-graph-hover-overlay",
      });

    this.hoverNodeEl =
      this.hoverOverlayEl.createDiv({
        cls:
          "optimized-graph-hover-node",
      });

    this.hoverLabelEl =
      this.hoverOverlayEl.createDiv({
        cls:
          "optimized-graph-hover-label",
      });

    this.clearHoverFocus();
  }

  private showHoverFocus(
    renderer:
      Sigma,

    graph:
      Graph,

    node:
      string,
  ): void {
    if (
      !this.graphEl ||
      !this.hoverOverlayEl ||
      !this.hoverNodeEl ||
      !this.hoverLabelEl
    ) {
      return;
    }

    if (
      !graph.hasNode(
        node,
      )
    ) {
      return;
    }

    const attributes =
      graph.getNodeAttributes(
        node,
      );

    const x =
      Number(
        attributes.x,
      );

    const y =
      Number(
        attributes.y,
      );

    if (
      !Number.isFinite(
        x,
      ) ||
      !Number.isFinite(
        y,
      )
    ) {
      return;
    }

    const position =
      renderer.graphToViewport({
        x,
        y,
      });

    const displayData =
      renderer.getNodeDisplayData(
        node,
      );

    const radius =
      Math.max(
        6,
        (
          displayData
            ?.size ??
          Number(
            attributes.size,
          ) ??
          4
        ) *
          1.6,
      );

    const label =
      String(
        attributes.label ??
        node,
      );

    this.hoveredNodeId =
      node;

    this.graphEl.addClass(
      "is-hover-focused",
    );

    this.hoverOverlayEl.addClass(
      "is-visible",
    );

    this.hoverNodeEl.style.width =
      `${radius * 2}px`;

    this.hoverNodeEl.style.height =
      `${radius * 2}px`;

    this.hoverNodeEl.style.transform =
      `translate(${position.x - radius}px, ${position.y - radius}px)`;

    this.hoverLabelEl.setText(
      label,
    );

    this.hoverLabelEl.style.transform =
      `translate(${position.x + radius + 8}px, ${position.y}px) translateY(-50%)`;
  }

  private clearHoverFocus():
    void {
    this.hoveredNodeId =
      null;

    this.graphEl?.removeClass(
      "is-hover-focused",
    );

    this.hoverOverlayEl
      ?.removeClass(
        "is-visible",
      );

    if (
      this.hoverLabelEl
    ) {
      this.hoverLabelEl.setText(
        "",
      );
    }
  }

  private startPhysics():
    void {
    if (
      !this.graph ||
      this.graph.order <
        2 ||
      !this.physics
    ) {
      return;
    }

    this.physics.startFor(
      this.plugin
        .settings
        .physicsAutoPauseSeconds,
    );
  }

  private async fitGraph():
    Promise<void> {
    if (
      !this.renderer
    ) {
      return;
    }

    const renderer =
      this.renderer;

    renderer.setCustomBBox(
      null,
    );

    renderer.refresh();

    this.freezeCurrentBounds(
      renderer,
    );

    await renderer
      .getCamera()
      .animatedReset({
        duration:
          250,
      });

    this.captureCameraState();
  }

  private async openNode(
    nodeId:
      string,
  ): Promise<void> {
    const graph =
      this.graph;

    if (
      !graph ||
      !graph.hasNode(
        nodeId,
      )
    ) {
      return;
    }

    const path =
      String(
        graph.getNodeAttribute(
          nodeId,
          "path",
        ) ??
        nodeId,
      );

    const file =
      this.app.vault
        .getAbstractFileByPath(
          path,
        );

    if (
      !(file instanceof
        TFile)
    ) {
      return;
    }

    const leaf =
      this.app.workspace
        .getLeaf(
          "tab",
        );

    await leaf.openFile(
      file,
    );

    await this.app.workspace
      .revealLeaf(
        leaf,
      );
  }

  private capturePositions():
    void {
    if (
      !this.graph
    ) {
      return;
    }

    const positions:
      Record<
        string,
        SavedGraphPosition
      > = {};

    this.graph.forEachNode(
      (
        node,
        attributes,
      ) => {
        const x =
          Number(
            attributes.x,
          );

        const y =
          Number(
            attributes.y,
          );

        if (
          !Number.isFinite(
            x,
          ) ||
          !Number.isFinite(
            y,
          )
        ) {
          return;
        }

        positions[node] = {
          x,
          y,
        };
      },
    );

    this.plugin
      .cachePositions(
        positions,
      );
  }

  private captureCameraState():
    void {
    if (
      !this.renderer
    ) {
      return;
    }

    const state =
      this.renderer
        .getCamera()
        .getState();

    this.cameraState = {
      x:
        state.x,

      y:
        state.y,

      angle:
        state.angle,

      ratio:
        state.ratio,
    };
  }

  private freezeCurrentBounds(
    renderer:
      Sigma,
  ): void {
    const bounds =
      renderer.getBBox();

    renderer.setCustomBBox(
      this.padBounds(
        bounds,
      ),
    );
  }

  private padBounds(
    bounds:
      GraphBounds,
  ): GraphBounds {
    const xMin =
      bounds.x[0];

    const xMax =
      bounds.x[1];

    const yMin =
      bounds.y[0];

    const yMax =
      bounds.y[1];

    const xRange =
      Math.max(
        1,
        xMax -
          xMin,
      );

    const yRange =
      Math.max(
        1,
        yMax -
          yMin,
      );

    const xPadding =
      xRange *
      0.12;

    const yPadding =
      yRange *
      0.12;

    return {
      x: [
        xMin -
          xPadding,

        xMax +
          xPadding,
      ],

      y: [
        yMin -
          yPadding,

        yMax +
          yPadding,
      ],
    };
  }

  private destroyRenderer():
    void {
    this.clearHoverFocus();

    this.physics?.kill();

    this.physics =
      null;

    this.renderer?.kill();

    this.renderer =
      null;

    this.graph =
      null;

    this.labelForceMode =
      null;

    this.draggedNode =
      null;

    this.isDragging =
      false;

    this.updateLayoutButton(
      false,
    );
  }

  private updateLayoutButton(
    running:
      boolean,
  ): void {
    if (
      !this.layoutButton
    ) {
      return;
    }

    this.layoutButton.setText(
      running
        ? "Pause layout"
        : "Run layout",
    );
  }

  private updateStatus(
    snapshot:
      GraphSnapshot,

    physicsRunning:
      boolean,
  ): void {
    if (
      !this.statusEl
    ) {
      return;
    }

    const clusterText =
      snapshot
        .stats
        .currentClusterApplied
        ? " · current cluster"
        : snapshot
            .stats
            .clusterRootMissing
          ? " · cluster root unavailable"
          : "";

    const cappedText =
      snapshot
        .stats
        .candidateNodes >
      snapshot
        .stats
        .renderedNodes
        ? ` · ${(
            snapshot
              .stats
              .candidateNodes -
            snapshot
              .stats
              .renderedNodes
          ).toLocaleString()} nodes hidden by limits`
        : "";

    const connectionText =
      snapshot
        .stats
        .hiddenConnections >
      0
        ? ` · ${snapshot.stats.hiddenConnections.toLocaleString()} links hidden by limits`
        : "";

    const orphanText =
      snapshot
        .stats
        .prunedFalseOrphans >
      0
        ? ` · ${snapshot.stats.prunedFalseOrphans.toLocaleString()} false orphans suppressed`
        : "";

    this.statusEl.setText(
      `${snapshot.stats.renderedNodes.toLocaleString()} nodes · ` +
      `${snapshot.stats.renderedEdges.toLocaleString()} links · ` +
      `${physicsRunning ? "layout running" : "layout paused"}` +
      clusterText +
      cappedText +
      connectionText +
      orphanText,
    );
  }

  private readThemeColors(): {
    node: string;
    attachment: string;
    accent: string;
    edge: string;
    label: string;
  } {
    const style =
      getComputedStyle(
        document.body,
      );

    const read = (
      variable:
        string,

      fallback:
        string,
    ): string => {
      const value =
        style
          .getPropertyValue(
            variable,
          )
          .trim();

      return value ||
        fallback;
    };

    return {
      node:
        read(
          "--text-muted",
          "#8b949e",
        ),

      attachment:
        read(
          "--text-faint",
          "#6e7681",
        ),

      accent:
        read(
          "--interactive-accent",
          "#7c3aed",
        ),

      edge:
        read(
          "--background-modifier-border",
          "#484f58",
        ),

      label:
        read(
          "--text-normal",
          "#d0d7de",
        ),
    };
  }

  private seedPosition(
    key:
      string,
  ): SavedGraphPosition {
    const hash =
      this.hashString(
        key,
      );

    const hash2 =
      this.hashString(
        `${key}:y`,
      );

    const angle =
      (
        hash %
        100000
      ) /
      100000 *
      Math.PI *
      2;

    const radius =
      10 +
      (
        hash2 %
        9000
      ) /
      100;

    return {
      x:
        Math.cos(
          angle,
        ) *
        radius,

      y:
        Math.sin(
          angle,
        ) *
        radius,
    };
  }

  private hashString(
    value:
      string,
  ): number {
    let hash =
      2166136261;

    for (
      let index = 0;
      index <
      value.length;
      index +=
      1
    ) {
      hash ^=
        value.charCodeAt(
          index,
        );

      hash =
        Math.imul(
          hash,
          16777619,
        );
    }

    return hash >>>
      0;
  }

  private isVisible():
    boolean {
    return (
      this.contentEl
        .isConnected &&
      this.contentEl
        .offsetParent !==
        null
    );
  }
}

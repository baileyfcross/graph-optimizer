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

    this.registerEvent(
      this.app
        .metadataCache
        .on(
          "changed",
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

    const refreshButton =
      toolbar.createEl(
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

    const fitButton =
      toolbar.createEl(
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

    this.layoutButton =
      toolbar.createEl(
        "button",
        {
          cls:
            "optimized-graph-toolbar-button",
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

    toolbar.createDiv({
      cls:
        "optimized-graph-toolbar-hint",
      text:
        "Double-click a node to open it. Drag nodes to reposition them.",
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

    /*
     * Yield once before scanning metadata so UI input that
     * triggered the refresh can finish painting first.
     */
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

    this.capturePositions();

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

          forceLabel:
            isCurrent,

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

          hideEdgesOnMove:
            true,

          hideLabelsOnMove:
            true,

          labelDensity:
            0.45,

          labelGridCellSize:
            120,

          labelRenderedSizeThreshold:
            7,

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

    this.startPhysics();
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
          renderer.setCustomBBox(
            renderer.getBBox(),
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

    this.renderer
      .setCustomBBox(
        null,
      );

    this.renderer.refresh();

    await this.renderer
      .getCamera()
      .animatedReset({
        duration:
          250,
      });
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

  private destroyRenderer():
    void {
    this.physics?.kill();

    this.physics =
      null;

    this.renderer?.kill();

    this.renderer =
      null;

    this.graph =
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
        ? ` · capped from ${snapshot.stats.candidateNodes.toLocaleString()} candidates`
        : "";

    this.statusEl.setText(
      `${snapshot.stats.renderedNodes.toLocaleString()} nodes · ` +
      `${snapshot.stats.renderedEdges.toLocaleString()} links · ` +
      `${physicsRunning ? "layout running" : "layout paused"}` +
      clusterText +
      cappedText,
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

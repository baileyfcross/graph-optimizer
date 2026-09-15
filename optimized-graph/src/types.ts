export interface OptimizedGraphSettings {
  maxVisibleNodes:
    500 | 1000 | 2000;

  maxLinksPerNode:
    10 | 25 | 50;

  ignoreAttachments:
    boolean;

  ignoredFolders:
    string[];

  minimumConnectionCount:
    number;

  renderCurrentClusterOnly:
    boolean;

  /*
   * Layout is static by default.
   *
   * When false, the graph never starts ForceAtlas2 merely
   * because the view opened or metadata refreshed.
   */
  autoRunLayoutOnRefresh:
    boolean;

  physicsAutoPauseSeconds:
    1 | 2 | 3 | 5;

  resumePhysicsOnDrag:
    boolean;

  refreshDebounceSeconds:
    1 | 2 | 3 | 5;
}

export interface SavedGraphPosition {
  x: number;
  y: number;
}

export interface OptimizedGraphPluginData {
  settings?:
    Partial<OptimizedGraphSettings>;

  positions?:
    Record<
      string,
      SavedGraphPosition
    >;
}

export interface GraphNodeData {
  id: string;
  path: string;
  label: string;
  extension: string;
  isAttachment: boolean;

  /*
   * Degree in Obsidian's eligible resolved-link graph before
   * visualization caps are applied.
   */
  degree: number;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  weight: number;
}

export interface GraphSnapshotStats {
  vaultFiles: number;
  eligibleFiles: number;

  /*
   * All resolved connections whose endpoints survived
   * attachment/folder filtering.
   */
  rawConnections: number;

  candidateNodes: number;

  /*
   * Connections between nodes selected by the visible-node
   * limiter, before the per-node edge cap is applied.
   */
  selectedConnections: number;

  renderedNodes: number;
  renderedEdges: number;

  /*
   * Nodes that had real eligible Obsidian links but would
   * have appeared visually orphaned after performance caps.
   * They are removed instead of being shown misleadingly.
   */
  prunedFalseOrphans: number;

  hiddenConnections: number;

  currentClusterApplied: boolean;
  clusterRootPath?: string;
  clusterRootMissing: boolean;
}

export interface GraphSnapshot {
  nodes:
    GraphNodeData[];

  edges:
    GraphEdgeData[];

  stats:
    GraphSnapshotStats;
}

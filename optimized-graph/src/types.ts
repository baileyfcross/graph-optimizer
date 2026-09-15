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
  rawConnections: number;
  candidateNodes: number;
  renderedNodes: number;
  renderedEdges: number;
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

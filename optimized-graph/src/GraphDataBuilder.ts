import {
  App,
  TFile,
} from "obsidian";

import type {
  GraphEdgeData,
  GraphNodeData,
  GraphSnapshot,
  OptimizedGraphSettings,
} from "./types";

import {
  normalizeFolderPath,
} from "./settings/Settings";

interface WeightedRawEdge {
  source: string;
  target: string;
  weight: number;
}

export class GraphDataBuilder {
  constructor(
    private readonly app:
      App,
  ) {}

  build(
    settings:
      OptimizedGraphSettings,

    currentFilePath:
      string | null,
  ): GraphSnapshot {
    const allFiles =
      this.app.vault
        .getFiles();

    const eligibleFileMap =
      this.collectEligibleFiles(
        allFiles,
        settings,
      );

    /*
     * resolvedLinks is the authoritative Obsidian graph:
     *
     * source path -> target path -> occurrence count.
     *
     * collectEdges() intentionally collapses reciprocal links
     * into one undirected visualization edge while preserving
     * their combined weight.
     */
    const rawEdges =
      this.collectEdges(
        eligibleFileMap,
      );

    const adjacency =
      this.buildAdjacency(
        eligibleFileMap,
        rawEdges,
      );

    const degree =
      this.calculateDegrees(
        eligibleFileMap,
        adjacency,
      );

    let clusterRootMissing =
      false;

    let rawClusterPaths:
      Set<string> |
      null =
      null;

    if (
      settings
        .renderCurrentClusterOnly
    ) {
      if (
        currentFilePath &&
        eligibleFileMap.has(
          currentFilePath,
        )
      ) {
        rawClusterPaths =
          this.collectConnectedComponent(
            currentFilePath,
            adjacency,
          );
      } else {
        clusterRootMissing =
          true;
      }
    }

    /*
     * First-pass candidates use the actual Obsidian degree.
     */
    let candidates =
      this.collectCandidates(
        eligibleFileMap,
        degree,
        rawClusterPaths,
        currentFilePath,
        settings
          .minimumConnectionCount,
      );

    /*
     * A degree threshold can itself create misleading visual
     * orphans. Example:
     *
     *   A -- HUB -- B
     *
     * If A and B are filtered out by the threshold, HUB still
     * has a real raw degree of 2 but would appear as an orphan.
     *
     * When the user asked to hide orphans via a non-zero
     * minimum connection count, remove candidates that have no
     * remaining candidate neighbor.
     */
    if (
      settings
        .minimumConnectionCount >
      0
    ) {
      candidates =
        this.removeFilterInducedOrphans(
          candidates,
          adjacency,
          currentFilePath,
        );
    }

    /*
     * Current-cluster mode should also be visually connected
     * after all filters are applied. Do not show disconnected
     * islands that were connected only through nodes removed by
     * another filter.
     */
    if (
      settings
        .renderCurrentClusterOnly &&
      currentFilePath &&
      candidates.includes(
        currentFilePath,
      )
    ) {
      const candidateSet =
        new Set(
          candidates,
        );

      const visibleCluster =
        this.collectConnectedComponent(
          currentFilePath,
          adjacency,
          candidateSet,
        );

      candidates =
        candidates.filter(
          (path) =>
            visibleCluster.has(
              path,
            ),
        );
    }

    /*
     * Connectivity-aware visible-node selection.
     *
     * The original version ranked nodes independently by
     * degree. That could select a note while excluding every
     * neighbor it linked to, producing a false visual orphan.
     *
     * This version expands through connected neighbors first.
     */
    const maximumVisibleNodes =
      settings
        .maxVisibleNodes ===
        "all"
        ? candidates.length
        : settings
            .maxVisibleNodes;

    const selectedPaths =
      this.selectNodes(
        candidates,
        adjacency,
        degree,
        currentFilePath,
        maximumVisibleNodes,
        Boolean(
          settings
            .renderCurrentClusterOnly &&
          rawClusterPaths,
        ),
      );

    const selectedSet =
      new Set(
        selectedPaths,
      );

    const selectedRawEdges =
      rawEdges.filter(
        (edge) =>
          selectedSet.has(
            edge.source,
          ) &&
          selectedSet.has(
            edge.target,
          ),
      );

    /*
     * Coverage-first edge capping.
     *
     * Before filling high-weight extra edges, attempt to give
     * each selected connected node at least one visible edge.
     * This avoids starving low-degree nodes merely because hub
     * edges were processed first.
     */
    const boundedEdges =
      this.boundEdgesCoverageFirst(
        selectedRawEdges,
        selectedPaths,
        degree,
        settings
          .maxLinksPerNode,
      );

    const visibleDegree =
      this.calculateVisibleDegree(
        selectedPaths,
        boundedEdges,
      );

    /*
     * The edge cap can still make a visible edge impossible.
     * A classic case is a 100-leaf star with a hub cap of 10.
     * Ninety leaves cannot be connected without violating the
     * user's configured cap.
     *
     * Rather than drawing those leaves as false orphans, omit
     * them from the rendered scene.
     *
     * True Obsidian orphans are still permitted when the user
     * explicitly sets Minimum connection count to 0.
     */
    const finalPaths =
      selectedPaths.filter(
        (path) => {
          const rawDegree =
            degree.get(
              path,
            ) ??
            0;

          const renderedDegree =
            visibleDegree.get(
              path,
            ) ??
            0;

          if (
            rawDegree ===
            0
          ) {
            return (
              settings
                .minimumConnectionCount ===
              0
            );
          }

          return (
            renderedDegree >
            0
          );
        },
      );

    const finalSet =
      new Set(
        finalPaths,
      );

    const finalEdges =
      boundedEdges.filter(
        (edge) =>
          finalSet.has(
            edge.source,
          ) &&
          finalSet.has(
            edge.target,
          ),
      );

    const prunedFalseOrphans =
      selectedPaths.reduce(
        (
          count,
          path,
        ) => {
          if (
            finalSet.has(
              path,
            )
          ) {
            return count;
          }

          return (
            (
              degree.get(
                path,
              ) ??
              0
            ) >
            0
              ? count +
                1
              : count
          );
        },
        0,
      );

    const nodes:
      GraphNodeData[] =
      finalPaths.map(
        (path) => {
          const file =
            eligibleFileMap.get(
              path,
            )!;

          return {
            id:
              path,

            path:
              file.path,

            label:
              file.extension
                .toLowerCase() ===
                "md"
                ? file.basename
                : file.name,

            extension:
              file.extension,

            isAttachment:
              file.extension
                .toLowerCase() !==
                "md",

            degree:
              degree.get(
                path,
              ) ??
              0,
          };
        },
      );

    const edges:
      GraphEdgeData[] =
      finalEdges.map(
        (
          edge,
          index,
        ) => ({
          id:
            `edge-${index}`,

          source:
            edge.source,

          target:
            edge.target,

          weight:
            edge.weight,
        }),
      );

    return {
      nodes,
      edges,

      stats: {
        vaultFiles:
          allFiles.length,

        eligibleFiles:
          eligibleFileMap
            .size,

        rawConnections:
          rawEdges.length,

        candidateNodes:
          candidates.length,

        selectedConnections:
          selectedRawEdges.length,

        renderedNodes:
          nodes.length,

        renderedEdges:
          edges.length,

        prunedFalseOrphans,

        hiddenConnections:
          Math.max(
            0,
            selectedRawEdges.length -
              finalEdges.length,
          ),

        currentClusterApplied:
          Boolean(
            settings
              .renderCurrentClusterOnly &&
            rawClusterPaths,
          ),

        clusterRootPath:
          rawClusterPaths
            ? currentFilePath ??
              undefined
            : undefined,

        clusterRootMissing,
      },
    };
  }

  private collectEligibleFiles(
    allFiles:
      TFile[],

    settings:
      OptimizedGraphSettings,
  ): Map<
    string,
    TFile
  > {
    const eligible =
      new Map<
        string,
        TFile
      >();

    const ignoredFolders =
      settings
        .ignoredFolders
        .map(
          (folder) =>
            normalizeFolderPath(
              folder,
            ),
        )
        .filter(Boolean);

    for (
      const file of
      allFiles
    ) {
      if (
        settings
          .ignoreAttachments &&
        file.extension
          .toLowerCase() !==
          "md"
      ) {
        continue;
      }

      if (
        this.isPathIgnored(
          file.path,
          ignoredFolders,
        )
      ) {
        continue;
      }

      eligible.set(
        file.path,
        file,
      );
    }

    return eligible;
  }

  private collectEdges(
    eligibleFileMap:
      Map<string, TFile>,
  ): WeightedRawEdge[] {
    const aggregate =
      new Map<
        string,
        WeightedRawEdge
      >();

    const resolvedLinks =
      this.app
        .metadataCache
        .resolvedLinks;

    for (
      const [
        sourcePath,
        targets,
      ] of
      Object.entries(
        resolvedLinks,
      )
    ) {
      if (
        !eligibleFileMap.has(
          sourcePath,
        )
      ) {
        continue;
      }

      for (
        const [
          targetPath,
          count,
        ] of
        Object.entries(
          targets,
        )
      ) {
        if (
          sourcePath ===
            targetPath ||
          !eligibleFileMap.has(
            targetPath,
          )
        ) {
          continue;
        }

        const [
          left,
          right,
        ] =
          sourcePath <
          targetPath
            ? [
                sourcePath,
                targetPath,
              ]
            : [
                targetPath,
                sourcePath,
              ];

        const key =
          `${left}\u0000${right}`;

        const weight =
          Math.max(
            1,
            Number(
              count,
            ) ||
              1,
          );

        const existing =
          aggregate.get(
            key,
          );

        if (
          existing
        ) {
          existing.weight +=
            weight;
        } else {
          aggregate.set(
            key,
            {
              source:
                left,

              target:
                right,

              weight,
            },
          );
        }
      }
    }

    return Array.from(
      aggregate.values(),
    );
  }

  private buildAdjacency(
    files:
      Map<string, TFile>,

    edges:
      WeightedRawEdge[],
  ): Map<
    string,
    Set<string>
  > {
    const adjacency =
      new Map<
        string,
        Set<string>
      >();

    for (
      const path of
      files.keys()
    ) {
      adjacency.set(
        path,
        new Set(),
      );
    }

    for (
      const edge of
      edges
    ) {
      adjacency
        .get(
          edge.source,
        )
        ?.add(
          edge.target,
        );

      adjacency
        .get(
          edge.target,
        )
        ?.add(
          edge.source,
        );
    }

    return adjacency;
  }

  private calculateDegrees(
    files:
      Map<string, TFile>,

    adjacency:
      Map<
        string,
        Set<string>
      >,
  ): Map<
    string,
    number
  > {
    const degree =
      new Map<
        string,
        number
      >();

    for (
      const path of
      files.keys()
    ) {
      degree.set(
        path,
        adjacency
          .get(
            path,
          )
          ?.size ??
          0,
      );
    }

    return degree;
  }

  private collectCandidates(
    files:
      Map<string, TFile>,

    degree:
      Map<
        string,
        number
      >,

    clusterPaths:
      Set<string> |
      null,

    currentFilePath:
      string | null,

    minimumConnectionCount:
      number,
  ): string[] {
    const candidates:
      string[] = [];

    for (
      const path of
      files.keys()
    ) {
      if (
        clusterPaths &&
        !clusterPaths.has(
          path,
        )
      ) {
        continue;
      }

      const nodeDegree =
        degree.get(
          path,
        ) ??
        0;

      if (
        nodeDegree <
          minimumConnectionCount &&
        path !==
          currentFilePath
      ) {
        continue;
      }

      candidates.push(
        path,
      );
    }

    return candidates;
  }

  private removeFilterInducedOrphans(
    candidates:
      string[],

    adjacency:
      Map<
        string,
        Set<string>
      >,

    currentFilePath:
      string | null,
  ): string[] {
    const candidateSet =
      new Set(
        candidates,
      );

    return candidates.filter(
      (path) => {
        const neighbors =
          adjacency.get(
            path,
          );

        if (
          !neighbors
        ) {
          return false;
        }

        for (
          const neighbor of
          neighbors
        ) {
          if (
            candidateSet.has(
              neighbor,
            )
          ) {
            return true;
          }
        }

        /*
         * Do not preserve a connected current note as an
         * apparent orphan merely because every neighbor was
         * filtered. That was one of the confusing behaviors
         * this integrity pass is intended to eliminate.
         *
         * A true current-note orphan is handled later when the
         * minimum connection count is explicitly zero.
         */
        return (
          path ===
            currentFilePath &&
          neighbors.size ===
            0
        );
      },
    );
  }

  private collectConnectedComponent(
    root:
      string,

    adjacency:
      Map<
        string,
        Set<string>
      >,

    allowedPaths?:
      Set<string>,
  ): Set<string> {
    const visited =
      new Set<string>();

    if (
      allowedPaths &&
      !allowedPaths.has(
        root,
      )
    ) {
      return visited;
    }

    const queue:
      string[] = [
        root,
      ];

    let index = 0;

    while (
      index <
      queue.length
    ) {
      const current =
        queue[index]!;
      index +=
        1;

      if (
        visited.has(
          current,
        )
      ) {
        continue;
      }

      if (
        allowedPaths &&
        !allowedPaths.has(
          current,
        )
      ) {
        continue;
      }

      visited.add(
        current,
      );

      const neighbors =
        adjacency.get(
          current,
        );

      if (!neighbors) {
        continue;
      }

      for (
        const neighbor of
        neighbors
      ) {
        if (
          allowedPaths &&
          !allowedPaths.has(
            neighbor,
          )
        ) {
          continue;
        }

        if (
          !visited.has(
            neighbor,
          )
        ) {
          queue.push(
            neighbor,
          );
        }
      }
    }

    return visited;
  }

  private selectNodes(
    candidates:
      string[],

    adjacency:
      Map<
        string,
        Set<string>
      >,

    degree:
      Map<
        string,
        number
      >,

    currentFilePath:
      string | null,

    maximum:
      number,

    clusterMode:
      boolean,
  ): string[] {
    if (
      candidates.length <=
      maximum
    ) {
      return [
        ...candidates,
      ];
    }

    const candidateSet =
      new Set(
        candidates,
      );

    if (
      clusterMode &&
      currentFilePath &&
      candidateSet.has(
        currentFilePath,
      )
    ) {
      return this.expandConnectedSelection(
        [
          currentFilePath,
        ],
        candidateSet,
        adjacency,
        degree,
        maximum,
      );
    }

    const rankedSeeds =
      this.rankPaths(
        candidates,
        degree,
        currentFilePath,
      );

    const selected:
      string[] = [];

    const selectedSet =
      new Set<string>();

    for (
      const seed of
      rankedSeeds
    ) {
      if (
        selected.length >=
        maximum
      ) {
        break;
      }

      if (
        selectedSet.has(
          seed,
        )
      ) {
        continue;
      }

      const candidateNeighbors =
        this.candidateNeighbors(
          seed,
          candidateSet,
          adjacency,
          degree,
        );

      const remaining =
        maximum -
        selected.length;

      /*
       * Avoid using the final slot on a seed that has real
       * candidate neighbors but no room to include one of them.
       * That would deliberately manufacture a visual orphan.
       */
      if (
        candidateNeighbors.length >
          0 &&
        remaining <
          2
      ) {
        break;
      }

      const componentSelection =
        this.expandConnectedSelection(
          [
            seed,
          ],
          candidateSet,
          adjacency,
          degree,
          remaining,
          selectedSet,
        );

      for (
        const path of
        componentSelection
      ) {
        if (
          selectedSet.has(
            path,
          )
        ) {
          continue;
        }

        selectedSet.add(
          path,
        );

        selected.push(
          path,
        );

        if (
          selected.length >=
          maximum
        ) {
          break;
        }
      }
    }

    return selected;
  }

  private expandConnectedSelection(
    seeds:
      string[],

    candidateSet:
      Set<string>,

    adjacency:
      Map<
        string,
        Set<string>
      >,

    degree:
      Map<
        string,
        number
      >,

    maximum:
      number,

    alreadySelected =
      new Set<string>(),
  ): string[] {
    const result:
      string[] = [];

    const queued =
      new Set<string>();

    const queue:
      string[] = [];

    for (
      const seed of
      seeds
    ) {
      if (
        !candidateSet.has(
          seed,
        ) ||
        alreadySelected.has(
          seed,
        ) ||
        queued.has(
          seed,
        )
      ) {
        continue;
      }

      queued.add(
        seed,
      );

      queue.push(
        seed,
      );
    }

    let index = 0;

    while (
      index <
        queue.length &&
      result.length <
        maximum
    ) {
      const current =
        queue[index]!;
      index +=
        1;

      if (
        alreadySelected.has(
          current,
        )
      ) {
        continue;
      }

      result.push(
        current,
      );

      const neighbors =
        this.candidateNeighbors(
          current,
          candidateSet,
          adjacency,
          degree,
        );

      for (
        const neighbor of
        neighbors
      ) {
        if (
          result.length +
            (
              queue.length -
              index
            ) >=
          maximum
        ) {
          break;
        }

        if (
          alreadySelected.has(
            neighbor,
          ) ||
          queued.has(
            neighbor,
          )
        ) {
          continue;
        }

        queued.add(
          neighbor,
        );

        queue.push(
          neighbor,
        );
      }
    }

    return result;
  }

  private candidateNeighbors(
    path:
      string,

    candidateSet:
      Set<string>,

    adjacency:
      Map<
        string,
        Set<string>
      >,

    degree:
      Map<
        string,
        number
      >,
  ): string[] {
    const neighbors =
      Array.from(
        adjacency.get(
          path,
        ) ??
        [],
      )
        .filter(
          (neighbor) =>
            candidateSet.has(
              neighbor,
            ),
        );

    return this.rankPaths(
      neighbors,
      degree,
      null,
    );
  }

  private rankPaths(
    paths:
      string[],

    degree:
      Map<
        string,
        number
      >,

    preferredPath:
      string | null,
  ): string[] {
    return [
      ...paths,
    ].sort(
      (
        left,
        right,
      ) => {
        if (
          left ===
          preferredPath
        ) {
          return -1;
        }

        if (
          right ===
          preferredPath
        ) {
          return 1;
        }

        const degreeDelta =
          (
            degree.get(
              right,
            ) ??
            0
          ) -
          (
            degree.get(
              left,
            ) ??
            0
          );

        if (
          degreeDelta !==
          0
        ) {
          return degreeDelta;
        }

        return left
          .localeCompare(
            right,
          );
      },
    );
  }

  private boundEdgesCoverageFirst(
    edges:
      WeightedRawEdge[],

    selectedPaths:
      string[],

    degree:
      Map<
        string,
        number
      >,

    maximumLinksPerNode:
      number,
  ): WeightedRawEdge[] {
    if (
      edges.length ===
      0
    ) {
      return [];
    }

    const sortedEdges =
      [
        ...edges,
      ].sort(
        (
          left,
          right,
        ) =>
          this.compareEdges(
            left,
            right,
            degree,
          ),
      );

    const incident =
      new Map<
        string,
        WeightedRawEdge[]
      >();

    for (
      const path of
      selectedPaths
    ) {
      incident.set(
        path,
        [],
      );
    }

    for (
      const edge of
      sortedEdges
    ) {
      incident
        .get(
          edge.source,
        )
        ?.push(
          edge,
        );

      incident
        .get(
          edge.target,
        )
        ?.push(
          edge,
        );
    }

    const used =
      new Map<
        string,
        number
      >();

    const selected:
      WeightedRawEdge[] = [];

    const selectedKeys =
      new Set<string>();

    const addEdge = (
      edge:
        WeightedRawEdge,
    ): boolean => {
      const key =
        this.edgeKey(
          edge,
        );

      if (
        selectedKeys.has(
          key,
        )
      ) {
        return true;
      }

      const sourceCount =
        used.get(
          edge.source,
        ) ??
        0;

      const targetCount =
        used.get(
          edge.target,
        ) ??
        0;

      if (
        sourceCount >=
          maximumLinksPerNode ||
        targetCount >=
          maximumLinksPerNode
      ) {
        return false;
      }

      selectedKeys.add(
        key,
      );

      selected.push(
        edge,
      );

      used.set(
        edge.source,
        sourceCount +
          1,
      );

      used.set(
        edge.target,
        targetCount +
          1,
      );

      return true;
    };

    /*
     * Hardest-to-cover nodes first:
     *
     * 1. fewer available selected neighbors;
     * 2. smaller raw Obsidian degree;
     * 3. stable path order.
     */
    const coverageOrder =
      [
        ...selectedPaths,
      ].sort(
        (
          left,
          right,
        ) => {
          const leftIncident =
            incident.get(
              left,
            )
              ?.length ??
            0;

          const rightIncident =
            incident.get(
              right,
            )
              ?.length ??
            0;

          if (
            leftIncident !==
            rightIncident
          ) {
            return (
              leftIncident -
              rightIncident
            );
          }

          const degreeDelta =
            (
              degree.get(
                left,
              ) ??
              0
            ) -
            (
              degree.get(
                right,
              ) ??
              0
            );

          if (
            degreeDelta !==
            0
          ) {
            return degreeDelta;
          }

          return left
            .localeCompare(
              right,
            );
        },
      );

    for (
      const path of
      coverageOrder
    ) {
      if (
        (
          used.get(
            path,
          ) ??
          0
        ) >
        0
      ) {
        continue;
      }

      for (
        const edge of
        incident.get(
          path,
        ) ??
        []
      ) {
        if (
          addEdge(
            edge,
          )
        ) {
          break;
        }
      }
    }

    /*
     * Fill the remaining per-node capacity with the strongest
     * surviving edges.
     */
    for (
      const edge of
      sortedEdges
    ) {
      addEdge(
        edge,
      );
    }

    return selected;
  }

  private compareEdges(
    left:
      WeightedRawEdge,

    right:
      WeightedRawEdge,

    degree:
      Map<
        string,
        number
      >,
  ): number {
    if (
      left.weight !==
      right.weight
    ) {
      return (
        right.weight -
        left.weight
      );
    }

    const leftDegree =
      (
        degree.get(
          left.source,
        ) ??
        0
      ) +
      (
        degree.get(
          left.target,
        ) ??
        0
      );

    const rightDegree =
      (
        degree.get(
          right.source,
        ) ??
        0
      ) +
      (
        degree.get(
          right.target,
        ) ??
        0
      );

    if (
      leftDegree !==
      rightDegree
    ) {
      return (
        rightDegree -
        leftDegree
      );
    }

    return this.edgeKey(
      left,
    ).localeCompare(
      this.edgeKey(
        right,
      ),
    );
  }

  private edgeKey(
    edge:
      WeightedRawEdge,
  ): string {
    return (
      `${edge.source}\u0000${edge.target}`
    );
  }

  private calculateVisibleDegree(
    paths:
      string[],

    edges:
      WeightedRawEdge[],
  ): Map<
    string,
    number
  > {
    const visibleDegree =
      new Map<
        string,
        number
      >();

    for (
      const path of
      paths
    ) {
      visibleDegree.set(
        path,
        0,
      );
    }

    for (
      const edge of
      edges
    ) {
      visibleDegree.set(
        edge.source,
        (
          visibleDegree.get(
            edge.source,
          ) ??
          0
        ) +
          1,
      );

      visibleDegree.set(
        edge.target,
        (
          visibleDegree.get(
            edge.target,
          ) ??
          0
        ) +
          1,
      );
    }

    return visibleDegree;
  }

  private isPathIgnored(
    path:
      string,

    ignoredFolders:
      string[],
  ): boolean {
    const normalizedPath =
      path.replace(
        /\\/g,
        "/",
      );

    for (
      const folder of
      ignoredFolders
    ) {
      if (
        normalizedPath ===
          folder ||
        normalizedPath
          .startsWith(
            `${folder}/`,
          )
      ) {
        return true;
      }
    }

    return false;
  }
}

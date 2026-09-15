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

      eligibleFileMap.set(
        file.path,
        file,
      );
    }

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
      new Map<
        string,
        number
      >();

    for (
      const path of
      eligibleFileMap.keys()
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

    let clusterRootMissing =
      false;

    let clusterPaths:
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
        clusterPaths =
          this.collectConnectedComponent(
            currentFilePath,
            adjacency,
          );
      } else {
        clusterRootMissing =
          true;
      }
    }

    const candidates:
      string[] = [];

    for (
      const path of
      eligibleFileMap.keys()
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
          settings
            .minimumConnectionCount &&
        path !==
          currentFilePath
      ) {
        continue;
      }

      candidates.push(
        path,
      );
    }

    const selectedPaths =
      this.selectNodes(
        candidates,
        adjacency,
        degree,
        currentFilePath,
        settings
          .maxVisibleNodes,
        Boolean(
          settings
            .renderCurrentClusterOnly &&
          clusterPaths,
        ),
      );

    const selectedSet =
      new Set(
        selectedPaths,
      );

    const boundedEdges =
      this.boundEdges(
        rawEdges,
        selectedSet,
        degree,
        settings
          .maxLinksPerNode,
      );

    const nodes:
      GraphNodeData[] =
      selectedPaths.map(
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
      boundedEdges.map(
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

        renderedNodes:
          nodes.length,

        renderedEdges:
          edges.length,

        currentClusterApplied:
          Boolean(
            settings
              .renderCurrentClusterOnly &&
            clusterPaths,
          ),

        clusterRootPath:
          clusterPaths
            ? currentFilePath ??
              undefined
            : undefined,

        clusterRootMissing,
      },
    };
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

  private collectConnectedComponent(
    root:
      string,

    adjacency:
      Map<
        string,
        Set<string>
      >,
  ): Set<string> {
    const visited =
      new Set<string>();

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

    if (
      clusterMode &&
      currentFilePath
    ) {
      const distance =
        this.collectDistances(
          currentFilePath,
          adjacency,
        );

      return [
        ...candidates,
      ]
        .sort(
          (
            left,
            right,
          ) => {
            const leftDistance =
              distance.get(
                left,
              ) ??
              Number
                .MAX_SAFE_INTEGER;

            const rightDistance =
              distance.get(
                right,
              ) ??
              Number
                .MAX_SAFE_INTEGER;

            if (
              leftDistance !==
              rightDistance
            ) {
              return (
                leftDistance -
                rightDistance
              );
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
        )
        .slice(
          0,
          maximum,
        );
    }

    const ranked =
      [
        ...candidates,
      ].sort(
        (
          left,
          right,
        ) => {
          if (
            left ===
            currentFilePath
          ) {
            return -1;
          }

          if (
            right ===
            currentFilePath
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

    return ranked.slice(
      0,
      maximum,
    );
  }

  private collectDistances(
    root:
      string,

    adjacency:
      Map<
        string,
        Set<string>
      >,
  ): Map<
    string,
    number
  > {
    const distance =
      new Map<
        string,
        number
      >();

    const queue:
      string[] = [
        root,
      ];

    distance.set(
      root,
      0,
    );

    let index = 0;

    while (
      index <
      queue.length
    ) {
      const current =
        queue[index]!;
      index +=
        1;

      const nextDistance =
        (
          distance.get(
            current,
          ) ??
          0
        ) +
        1;

      for (
        const neighbor of
        adjacency.get(
          current,
        ) ??
        []
      ) {
        if (
          distance.has(
            neighbor,
          )
        ) {
          continue;
        }

        distance.set(
          neighbor,
          nextDistance,
        );

        queue.push(
          neighbor,
        );
      }
    }

    return distance;
  }

  private boundEdges(
    rawEdges:
      WeightedRawEdge[],

    selectedNodes:
      Set<string>,

    degree:
      Map<
        string,
        number
      >,

    maximumLinksPerNode:
      number,
  ): WeightedRawEdge[] {
    const candidates =
      rawEdges
        .filter(
          (edge) =>
            selectedNodes.has(
              edge.source,
            ) &&
            selectedNodes.has(
              edge.target,
            ),
        )
        .sort(
          (
            left,
            right,
          ) => {
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

            return (
              rightDegree -
              leftDegree
            );
          },
        );

    const used =
      new Map<
        string,
        number
      >();

    const selected:
      WeightedRawEdge[] = [];

    for (
      const edge of
      candidates
    ) {
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
        continue;
      }

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
    }

    return selected;
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

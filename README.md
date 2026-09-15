# Optimized Graph

Optimized Graph is a separate performance-focused graph view for Obsidian.

It does not modify or replace Obsidian's built-in Graph View.

The view is designed for larger linked-note vaults where a continuously
simulated global graph becomes expensive.

## Architecture

```text
Obsidian vault
    |
    +-- MetadataCache.resolvedLinks
    |
    +-- GraphDataBuilder
    |     |
    |     +-- folder filtering
    |     +-- attachment filtering
    |     +-- minimum-degree filtering
    |     +-- current-cluster filtering
    |     +-- visible-node cap
    |     +-- per-node link cap
    |
    +-- Graphology
    |     |
    |     +-- bounded in-memory graph
    |
    +-- Sigma 3
    |     |
    |     +-- WebGL node/edge rendering
    |
    +-- ForceAtlas2 Web Worker
          |
          +-- runs outside Obsidian's main UI thread
          +-- automatically pauses after a short interval
```

Sigma is used only for rendering. The source of truth remains Obsidian's own
metadata cache.

## Performance controls

### Maximum visible nodes

Available values:

```text
500
1,000
2,000
```

The plugin never renders more nodes than this limit.

Global mode ranks nodes primarily by connection count.

Current-cluster mode prioritizes graph distance from the cluster root.

### Maximum links per node

Available values:

```text
10
25
50
```

Edges are ranked by link weight. The strongest connections are retained first,
while each endpoint is prevented from exceeding the configured link limit.

This keeps heavily linked hub notes from creating extremely dense scenes.

### Ignore attachment nodes

Default:

```text
On
```

When enabled, only Markdown files become graph nodes.

When disabled, linked PDFs, images, audio files, and other vault files may also
appear.

### Ignored folders

Enter one vault-relative folder per line.

Example:

```text
2 - Source Material
Attachments
Archive
```

Every file below those folders is excluded before graph construction.

### Minimum connection count

Nodes below this unique-neighbor count are excluded.

The active cluster root is retained even if it is below the threshold.

### Render only current cluster

When enabled, the graph uses the connected component containing the most
recently active Markdown note.

This is normally much cheaper than rendering a global graph.

### Physics auto-pause

Available values:

```text
1 second
2 seconds
3 seconds
5 seconds
```

The ForceAtlas2 layout runs in a Web Worker and stops automatically after this
interval.

The graph remains fully interactive after physics stops.

### Resume physics after node drag

When enabled, dragging a node stops the worker during the drag and restarts it
after release.

The restarted layout uses the same automatic pause interval.

### Refresh debounce

Available values:

```text
1 second
2 seconds
3 seconds
5 seconds
```

Metadata/vault changes are coalesced so a burst of edits does not trigger a
graph rebuild for every individual event.

## Additional performance behavior

Optimized Graph also:

- disables edge interaction picking;
- does not render edge labels;
- hides edges and labels while the camera is moving;
- reduces label density;
- skips rebuilds while the graph view is hidden;
- caches graph coordinates between view rebuilds and Obsidian sessions;
- uses deterministic positions for nodes without cached coordinates;
- performs expensive ForceAtlas2 layout work in a Web Worker;
- destroys the worker and WebGL renderer when the view is closed.

## Interactions

```text
Double-click node
    Open the file in a new tab.

Drag node
    Reposition the node.

Refresh
    Immediately rebuild from Obsidian metadata.

Fit
    Recalculate the current graph bounds and reset the camera.

Run layout
    Start ForceAtlas2 for the configured auto-pause interval.

Pause layout
    Stop ForceAtlas2 immediately.
```

## Project tree

```text
optimized-graph/
├── .gitignore
├── LICENSE
├── README.md
├── esbuild.config.mjs
├── manifest.json
├── package.json
├── styles.css
├── tsconfig.json
├── scripts/
│   └── deploy-test.sh
└── src/
    ├── GraphDataBuilder.ts
    ├── GraphPhysicsController.ts
    ├── OptimizedGraphView.ts
    ├── main.ts
    ├── types.ts
    └── settings/
        ├── OptimizedGraphSettingTab.ts
        └── Settings.ts
```

## Dependencies

### sigma

Stable Sigma 3 WebGL graph renderer.

https://www.npmjs.com/package/sigma

https://www.sigmajs.org/docs/

### graphology

Graph data structure consumed by Sigma and ForceAtlas2.

https://www.npmjs.com/package/graphology

### graphology-layout-forceatlas2

ForceAtlas2 graph layout implementation.

The plugin uses the package's Web Worker supervisor rather than running the
layout synchronously on Obsidian's renderer thread.

https://www.npmjs.com/package/graphology-layout-forceatlas2

## Build

From the source directory:

```bash
npm install
npm run typecheck
npm run build
```

This creates:

```text
main.js
```

The runtime Obsidian plugin directory requires only:

```text
<Vault>/.obsidian/plugins/optimized-graph/
├── main.js
├── manifest.json
└── styles.css
```

## Test-vault deployment

Set the destination once in Git Bash:

```bash
export OBSIDIAN_TEST_PLUGIN_DIR="/g/Obsidian/TestVault/.obsidian/plugins/optimized-graph"
```

Then run:

```bash
npm run deploy:test
```

Reload Obsidian or disable/re-enable the plugin after deployment.

## Opening the graph

Use either:

```text
Ribbon -> Open Optimized Graph
```

or the command palette:

```text
Optimized Graph: Open Optimized Graph
```

## Recommended initial settings

For a large vault, start with:

```text
Maximum visible nodes:        1,000
Maximum links per node:       25
Ignore attachment nodes:      On
Ignored folders:              source/attachment folders you do not graph
Minimum connection count:     1
Render only current cluster:  Off for overview, On for daily navigation
Pause physics automatically:  3 seconds
Resume physics after drag:    On
Refresh debounce:             2 seconds
```

If the graph is still heavy:

```text
Maximum visible nodes:        500
Maximum links per node:       10
Minimum connection count:     2 or 3
Render only current cluster:  On
Pause physics automatically:  2 seconds
Refresh debounce:             3 or 5 seconds
```

## Safety

The plugin reads Obsidian's metadata cache and vault file list.

It does not edit note contents, rename files, create links, or modify the
built-in Graph View.

Cached graph coordinates and plugin settings are stored in the plugin's normal
Obsidian data file.

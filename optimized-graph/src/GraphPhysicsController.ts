import type Graph
  from "graphology";

import forceAtlas2
  from "graphology-layout-forceatlas2";

import FA2Layout
  from "graphology-layout-forceatlas2/worker";

export class GraphPhysicsController {
  private readonly layout:
    FA2Layout;

  private autoPauseTimer:
    number |
    null =
    null;

  private killed =
    false;

  constructor(
    graph:
      Graph,

    private readonly onRunningChanged:
      (
        running:
          boolean,
      ) => void,

    private readonly onStopped:
      () => void,
  ) {
    const inferred =
      forceAtlas2
        .inferSettings(
          graph,
        );

    this.layout =
      new FA2Layout(
        graph,
        {
          settings:
            inferred,
        },
      );
  }

  startFor(
    seconds:
      number,
  ): void {
    if (
      this.killed
    ) {
      return;
    }

    this.clearTimer();

    if (
      !this.layout
        .isRunning()
    ) {
      this.layout.start();

      this.onRunningChanged(
        true,
      );
    }

    this.autoPauseTimer =
      window.setTimeout(
        () => {
          this.stop();
        },
        Math.max(
          250,
          seconds *
            1000,
        ),
      );
  }

  stop():
    void {
    if (
      this.killed
    ) {
      return;
    }

    this.clearTimer();

    if (
      this.layout
        .isRunning()
    ) {
      this.layout.stop();
    }

    this.onRunningChanged(
      false,
    );

    this.onStopped();
  }

  isRunning():
    boolean {
    if (
      this.killed
    ) {
      return false;
    }

    return this.layout
      .isRunning();
  }

  kill():
    void {
    if (
      this.killed
    ) {
      return;
    }

    this.clearTimer();

    this.layout.kill();

    this.killed =
      true;

    this.onRunningChanged(
      false,
    );
  }

  private clearTimer():
    void {
    if (
      this.autoPauseTimer ===
      null
    ) {
      return;
    }

    window.clearTimeout(
      this.autoPauseTimer,
    );

    this.autoPauseTimer =
      null;
  }
}

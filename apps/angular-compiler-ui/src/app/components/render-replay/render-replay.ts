import { Component, computed, input, linkedSignal, output } from '@angular/core';
import type { InspectionActivity, InspectionBlock } from '../../inspection-types';

export const replayLimit = 60;

interface HistoryWindow {
  frames: readonly InspectionActivity[];
  index: number;
}

@Component({
  selector: 'app-render-replay',
  templateUrl: './render-replay.html',
  styleUrl: './render-replay.css',
})
export class RenderReplay {
  frames = input.required<readonly InspectionActivity[]>();
  runId = input.required<number>();
  blocks = input.required<readonly InspectionBlock[]>();
  stale = input(false);
  inspectSource = output<InspectionBlock>();

  // A frozen window stays readable even as new frames rotate through the live buffer.
  protected readonly history = linkedSignal<number, HistoryWindow | null>({
    source: this.runId, computation: () => null,
  });
  protected readonly visible = computed(() => this.history()?.frames ?? this.frames());
  protected readonly index = computed(() => this.history()?.index ?? this.visible().length - 1);
  protected readonly frame = computed(() => this.visible()[this.index()]);
  protected readonly stateEntries = computed(() => Object.entries(this.frame()?.state ?? {}));
  protected readonly lookup = computed(() => new Map(this.blocks().map(block => [block.id, block])));
  protected readonly limit = replayLimit;

  protected seek(index: number) {
    const frames = this.visible();
    if (Number.isInteger(index) && index >= 0 && index < frames.length) this.history.set({frames, index});
  }
}

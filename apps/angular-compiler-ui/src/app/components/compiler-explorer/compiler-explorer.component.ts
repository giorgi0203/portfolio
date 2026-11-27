import {
  afterRenderEffect, Component, computed, effect, ElementRef, inject, input, output, signal, untracked,
} from '@angular/core';
import {
  generatedLines, parseCompilerInstructions, type CompilerInstruction, type CompilerPhase, type SourceMatch,
} from '../../compiler-explanations';
import { decodeInstruction } from '../../instruction-decoder';
import type { InspectionBlock, InspectionSelection } from '../../inspection-types';
import { owningPreviewBlock } from '../../workspace-selection';
import type { CompiledFile } from 'shared-types';
import type { CompilationOutcome } from '../../services/compiler-api.service';

type SelectionRange = Pick<SourceMatch, 'startLine' | 'endLine'> & Partial<Pick<SourceMatch, 'start' | 'end'>>;

function overlaps(match: SourceMatch, range: SelectionRange): boolean {
  if (range.start === undefined || range.end === undefined) {
    return match.startLine <= range.endLine && match.endLine >= range.startLine;
  }
  if (range.start === range.end) return match.start <= range.start && match.end > range.start;
  return match.start < range.end && match.end > range.start;
}

function priority(instruction: CompilerInstruction, block?: InspectionBlock): number {
  if (/Listener$/i.test(instruction.name) && block?.bindings.some(binding => binding.kind === 'event' || binding.kind === 'two-way')) return -1;
  if (/advance$|ElementEnd$/.test(instruction.name)) return 4;
  if (instruction.phase === 'update') return 0;
  if (/Listener$/i.test(instruction.name)) return 1;
  if (instruction.phase === 'creation') return 2;
  return 3;
}

@Component({
  selector: 'app-compiler-explorer', standalone: true,
  templateUrl: './compiler-explorer.component.html', styleUrl: './compiler-explorer.component.css',
})
export class CompilerExplorerComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  result = input<CompilationOutcome | null>(null);
  isCompiling = input(false);
  source = input('');
  compiledSource = input('');
  selectedSource = input<SelectionRange | null>(null);
  previewBlocks = input<InspectionBlock[]>([]);
  observedBlock = input<InspectionBlock | null>(null);
  observation = input<InspectionSelection | null>(null);
  serverStatus = input<'checking' | 'online' | 'offline'>('checking');
  sourceFocus = output<SourceMatch>();
  instructionFocus = output<CompilerInstruction | null>();
  compileRequested = output<void>();
  retryRequested = output<void>();

  view = signal<'annotated' | 'raw'>('annotated');
  phase = signal<CompilerPhase | 'all'>('all');
  filePath = signal('');
  selectedId = signal('');
  copied = signal(false);
  unmappedSelection = signal(false);
  private manualId = '';
  readonly phases = [
    {id: 'all', label: 'All'}, {id: 'creation', label: 'Creation'}, {id: 'update', label: 'Update'},
    {id: 'definition', label: 'Definition'}, {id: 'event', label: 'Event callbacks'}, {id: 'helper', label: 'Helpers'},
  ] as const;
  readonly files = computed(() => {
    const value = this.result();
    return value?.success ? value.files : [];
  });
  readonly file = computed<CompiledFile | undefined>(() => this.files().find(file => file.path === this.filePath())
    ?? this.files().find(file => file.path.includes('component')) ?? this.files()[0]);
  readonly stale = computed(() => !!this.result()?.success && this.compiledSource() !== this.source());
  readonly instructions = computed(() => {
    const file = this.file();
    return file ? parseCompilerInstructions(file.content, this.compiledSource(), file.path, file.templateMap) : [];
  });
  readonly filtered = computed(() => this.instructions().filter(
    instruction => this.phase() === 'all' || instruction.phase === this.phase(),
  ));
  readonly lines = computed(() => {
    const file = this.file();
    return file ? generatedLines(file.content, this.instructions()) : [];
  });
  readonly selected = computed(() => this.unmappedSelection() ? undefined :
    this.filtered().find(instruction => instruction.id === this.selectedId()) ?? this.filtered()[0]);
  readonly sameLine = computed(() => {
    const line = this.selected()?.line;
    return this.instructions().filter(instruction => instruction.line === line);
  });
  readonly decoded = computed(() => {
    const instruction = this.selected();
    const file = this.file();
    return instruction && file ? decodeInstruction(instruction, file.content) : null;
  });
  readonly visibleLineLimit = computed(() => (this.file()?.content.split('\n').length ?? 0) > 1800);
  // A parent span contains its children's code too. Associate calls with the innermost element.
  private readonly ownerByInstruction = computed(() => {
    const blocks = this.previewBlocks();
    const owners = new Map<string, string>();
    for (const instruction of this.instructions()) {
      const match = instruction.sourceMatch;
      if (!match) continue;
      const owner = owningPreviewBlock(match, blocks);
      if (owner) owners.set(instruction.id, owner.id);
    }
    return owners;
  });
  readonly related = computed(() => {
    const current = this.selected();
    const owners = this.ownerByInstruction();
    const owner = current && owners.get(current.id);
    if (this.stale() || !owner) return [];
    return this.instructions().filter(instruction => owners.get(instruction.id) === owner);
  });
  readonly observed = computed(() => {
    const instruction = this.selected();
    const block = this.observedBlock();
    const observation = this.observation();
    if (this.stale() || !instruction || !observation || !block || observation.blockId !== block.id ||
        this.ownerByInstruction().get(instruction.id) !== block.id) return null;
    return {
      selection: observation,
      fields: Object.entries(observation.values).filter(([name]) => instruction.bindings.includes(name)),
      locals: Object.entries(observation.locals),
    };
  });
  readonly snippet = computed(() => {
    const match = this.selected()?.sourceMatch;
    if (!match) return '';
    const source = this.compiledSource().slice(match.start, match.end);
    return source.length > 420 ? source.slice(0, 420) + '…' : source;
  });

  constructor() {
    effect(() => {
      const range = this.selectedSource();
      const instructions = this.instructions();
      const stale = this.stale();
      if (!range || stale || !instructions.length) {
        this.unmappedSelection.set(false);
        return;
      }
      const owners = this.ownerByInstruction();
      const block = this.previewBlocks().find(item => item.start === range.start && item.end === range.end);
      const matches = instructions.filter(instruction => instruction.sourceMatch && overlaps(instruction.sourceMatch, range)
        && (!block || owners.get(instruction.id) === block.id));
      // A preview focus reply can cover the whole element. Keep the call that initiated the link.
      const manual = matches.find(instruction => instruction.id === this.manualId && (block ||
        (instruction.sourceMatch?.start === range.start && instruction.sourceMatch?.end === range.end)));
      const spanSize = (instruction: CompilerInstruction) => {
        const match = instruction.sourceMatch;
        return match ? match.end - match.start : Infinity;
      };
      const match = manual ?? matches.sort((a, b) => block
        ? priority(a, block) - priority(b, block) || spanSize(a) - spanSize(b)
        : spanSize(a) - spanSize(b) || priority(a) - priority(b))[0];
      this.unmappedSelection.set(!match);
      if (!match) return;
      if (!manual) this.manualId = '';
      const filter = untracked(this.phase);
      if (filter !== 'all' && filter !== match.phase) this.phase.set('all');
      this.selectedId.set(match.id);
    });
    afterRenderEffect(() => {
      const selected = this.selected();
      this.view();
      if (!selected) return;
      this.revealRow('.generated-code', '[data-line="' + selected.line + '"]');
      this.revealRow('.instruction-list', '.active');
    });
  }

  private revealRow(containerSelector: string, rowSelector: string) {
    const container = this.host.nativeElement.querySelector<HTMLElement>(containerSelector);
    const row = container?.querySelector<HTMLElement>(rowSelector);
    if (!container?.clientHeight || !row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
  }

  select(instruction: CompilerInstruction | undefined) {
    this.unmappedSelection.set(false);
    this.manualId = instruction?.id ?? '';
    this.selectedId.set(this.manualId);
    if (!instruction) {
      this.instructionFocus.emit(null);
      return;
    }
    if (this.phase() !== 'all' && this.phase() !== instruction.phase) this.phase.set('all');
    if (!this.stale()) this.instructionFocus.emit(instruction);
  }

  selectLine(line: number) {
    const match = this.instructions().find(instruction => instruction.line === line);
    if (match) this.select(match);
  }

  selectPhase(phase: CompilerPhase | 'all') {
    this.phase.set(phase);
    const filtered = this.filtered();
    this.select(filtered.find(instruction => instruction.id === this.selectedId()) ?? filtered[0]);
  }

  selectFile(path: string) {
    if (this.file()?.path === path) return;
    this.filePath.set(path);
    this.copied.set(false);
    this.phase.set('all');
    this.select(this.instructions()[0]);
  }

  showSource() {
    const match = this.selected()?.sourceMatch;
    if (match && !this.stale()) this.sourceFocus.emit(match);
  }

  async copy() {
    const content = this.file()?.content;
    if (!content) return;
    try { await navigator.clipboard.writeText(content); this.copied.set(true); }
    catch { this.copied.set(false); }
  }
  download() {
    const file = this.file();
    if (!file) return;
    const url = URL.createObjectURL(new Blob([file.content], {type: 'text/javascript;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.path.split('/').pop() || 'compiled-component.js';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  phaseLabel(phase: CompilerPhase) {
    const labels: Record<CompilerPhase, string> = {
      creation: 'Creation · rf & 1', update: 'Update · rf & 2', definition: 'Definition',
      event: 'Event callback', helper: 'Rendering helper',
    };
    return labels[phase];
  }
}

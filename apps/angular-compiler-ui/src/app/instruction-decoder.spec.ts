import { VERSION } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { parseCompilerInstructions, type CompilerInstruction } from './compiler-explanations';
import { fixtureCode, fixtureSource } from './components/compiler-explorer/compiler-fixture';
import { decodeInstruction } from './instruction-decoder';

const calls = parseCompilerInstructions(fixtureCode, fixtureSource);

function fixtureCall(name: string, contains = ''): CompilerInstruction {
  const match = calls.find(call => call.name === name && call.raw.includes(contains));
  if (!match) throw new Error('Fixture has no ' + name + ' containing ' + contains);
  return match;
}

function decodeCall(code: string) {
  const [instruction] = parseCompilerInstructions(code, '');
  return decodeInstruction(instruction, code);
}

describe('AOT instruction decoder', () => {
  it('decodes each button argument and looks up the literal consts entry from the emitted definition', () => {
    const button = fixtureCall('ɵɵdomElementStart', '"button"');
    const decoded = decodeInstruction(button, fixtureCode);
    expect(decoded.arguments.map(arg => [arg.label, arg.value])).toEqual([
      ['View slot', '2'], ['Tag name', '"button"'], ['Attributes constant', '0'],
    ]);
    expect(decoded.arguments[2].detail).toContain('consts[0] = [3, "click"]');
    expect(decoded.sourceVersion).toBe(VERSION.full);
    expect(decoded.sourceUrl).toContain('/' + VERSION.full + '/packages/core/src/render3/instructions/element.ts#L201');
  });

  it('keeps element slots distinct from the declared binding count', () => {
    const definition = fixtureCall('ɵɵdefineComponent');
    const args = decodeInstruction(definition, fixtureCode).arguments;
    expect(args.find(arg => arg.label === 'decls')?.value).toBe('7');
    expect(args.find(arg => arg.label === 'vars')?.value).toBe('2');
    expect(args.find(arg => arg.label === 'consts')?.value).toBe('[[3, "click"]]');
  });

  it('shows the relative advance default and the actual value supplied for an explicit advance', () => {
    expect(decodeCall('i0.ɵɵadvance()').arguments[0].value).toBe('1 (default)');
    expect(decodeCall('i0.ɵɵadvance(3)').arguments[0].value).toBe('3');
  });

  it('keeps nested expressions, callbacks and commas in literals or regex intact', () => {
    const decoded = decodeCall('i0.ɵɵtextInterpolate2("a,b", ctx.sum(1, 2), "/", [3, 4].map(x => /a,b/.test(x)), "!")');
    expect(decoded.arguments.map(arg => arg.value)).toEqual(['"a,b"', 'ctx.sum(1, 2)', '"/"', '[3, 4].map(x => /a,b/.test(x))', '"!"']);
    expect(decoded.arguments.map(arg => arg.label)).toEqual(['Prefix', 'Expression 1', 'Separator', 'Expression 2', 'Suffix']);
    expect(decoded.steps.join(' ')).toContain('NO_CHANGE');
    expect(decoded.steps.join(' ')).toContain('selected text node');
    const nested = decodeCall('i0.ɵɵdomListener("click", function($event) { return ctx.send({x: 1, y: 2}, $event); })');
    expect(nested.arguments).toHaveLength(2);
    expect(nested.arguments[1].value).toContain('ctx.send({x: 1, y: 2}, $event)');
  });

  it('handles chained raw argument lists and skips ambiguous constants in multi-component files', () => {
    const first = fixtureCall('ɵɵdomElementStart');
    const decoded = decodeInstruction({ ...first, raw: '(8, "em", 0)' }, fixtureCode + '\ni0.ɵɵdefineComponent({consts:[[1,"other"]]})');
    expect(decoded.arguments.map(arg => arg.value)).toEqual(['8', '"em"', '0']);
    expect(decoded.arguments[2].detail).not.toContain('consts[0] =');
  });

  it('describes native property changes, directive-input routing, and keyed view reconciliation separately', () => {
    expect(decodeCall('i0.ɵɵdomProperty("value", ctx.name)').steps.join(' ')).toContain('setDomProperty');
    expect(decodeCall('i0.ɵɵproperty("value", ctx.name)').steps.join(' ')).toContain('setPropertyAndInputs');
    const setup = fixtureCall('ɵɵrepeaterCreate');
    expect(decodeInstruction(setup, fixtureCode).arguments[6]).toMatchObject({ label: 'Tracking function', value: '_forTrack0' });
    expect(decodeCall('i0.ɵɵrepeater(ctx.items())').steps.join(' ')).toContain('tracking function');
  });

  it('explains cached template outlet context objects and local references', () => {
    const context = decodeCall('i0.ɵɵpureFunction1(4, _c0, ctx.item)');
    expect(context.arguments.map(arg => arg.label)).toEqual(['Cache offset', 'Pure function', 'Input 1']);
    expect(context.steps.join(' ')).toContain('object identity');
    expect(decodeCall('i0.ɵɵreference(2)').arguments[0]).toMatchObject({ label: 'Reference slot', value: '2' });
  });

  it('preserves unfamiliar call arguments without inventing an implementation or a source URL', () => {
    const decoded = decodeCall('i0.ɵɵnewHelper(ctx.thing, 7)');
    expect(decoded.arguments.map(arg => [arg.label, arg.value])).toEqual([['Argument 1', 'ctx.thing'], ['Argument 2', '7']]);
    expect(decoded.sourceUrl).toBeNull();
    expect(decoded.steps[0]).toMatch(/unavailable/);
  });
});

import { describe, it, expect } from 'vitest';
import { generatedLines, parseCompilerInstructions } from './compiler-explanations';
import { fixtureCode,fixtureSource } from './components/compiler-explorer/compiler-fixture';

describe('Actual AOT instruction explanations',()=>{
  it('recognizes real Angular 21 creation, update, event and control-flow instructions',()=>{
    const instructions=parseCompilerInstructions(fixtureCode,fixtureSource);
    expect(instructions.some(instruction=>instruction.name==='ɵɵdefineComponent'&&instruction.phase==='definition')).toBe(true);
    expect(instructions.some(instruction=>instruction.name==='ɵɵdomElementStart'&&instruction.phase==='creation')).toBe(true);
    expect(instructions.some(instruction=>instruction.name.startsWith('ɵɵtextInterpolate')&&instruction.phase==='update'&&instruction.bindings.includes('count'))).toBe(true);
    expect(instructions.some(instruction=>instruction.name==='ɵɵdomListener'&&instruction.sourceMatch?.startLine===4)).toBe(true);
    expect(instructions.some(instruction=>instruction.name==='ɵɵconditional'&&instruction.phase==='update')).toBe(true);
    expect(instructions.some(instruction=>instruction.name==='ɵɵrepeater'&&instruction.phase==='update')).toBe(true);
    expect(instructions.every(instruction=>instruction.line>0&&instruction.endLine>=instruction.line)).toBe(true);
  });
  it('does not treat instruction names inside comments or strings as executable instructions',()=>{
    const code='const label="ɵɵtextInterpolate(ctx.password)";\n// ɵɵlistener("click", bad)\n/* ɵɵproperty("x", ctx.private) */\ni0.ɵɵtext(0, "literal ) { }");';
    const instructions=parseCompilerInstructions(code,'');
    expect(instructions.map(instruction=>instruction.name)).toEqual(['ɵɵtext']);
    expect(instructions[0].raw).toBe('ɵɵtext(0, "literal ) { }")');
    expect(instructions[0].sourceMatch).toBeNull();
  });
  it('ignores Angular-looking instruction text in regular expressions and identifies delayed event helpers',()=>{
    const code='this.pattern=/ɵɵproperty(1)/; if(ok) /i0.ɵɵlistener(2)/.test(value); const literal=/[\\/](ɵɵadvance(3))/g; if(rf & 1){i0.ɵɵlistener("click",function(){i0.ɵɵrestoreView(saved);return ctx.go();});}';
    const instructions=parseCompilerInstructions(code,'');
    expect(instructions.map(instruction=>instruction.name)).toEqual(['ɵɵlistener','ɵɵrestoreView']);
    expect(instructions.map(instruction=>instruction.phase)).toEqual(['creation','event']);
  });
  it('discloses approximate evidence and never guesses a source range for unknown helpers',()=>{
    const instructions=parseCompilerInstructions('if (rf & 2) {i0.ɵɵtextInterpolate(ctx.count()); i0.ɵɵunknownHelper(ctx.nope);}',fixtureSource);
    const match=instructions[0].sourceMatch;
    expect(match?.approximate).toBe(true);
    expect(match?.startLine).toBe(3);
    expect(fixtureSource.slice(match?.start,match?.end)).toBe('{{ count() }}');
    expect(instructions[1].sourceMatch).toBeNull();
    expect(instructions[1].explanation).toContain('does not invent a runtime value');
  });
  it('keeps emitted lines unchanged, including potentially unsafe HTML-looking text',()=>{
    const code='i0.ɵɵtext(0, "<img src=x onerror=alert(1)>");\n';
    const lines=generatedLines(code,parseCompilerInstructions(code,''));
    expect(lines.map(line=>line.content).join('\n')).toBe(code);
    expect(lines[0].instructions[0].comment).toContain('Create a text node');
  });
  it('distinguishes nested creation and update view functions without reading strings as braces',()=>{
    const code='function Child(rf,ctx){if(rf & 1){i0.ɵɵtext(0,"}");}if(rf & 2){i0.ɵɵtextInterpolate(ctx.name);}}\nfunction Parent(rf,ctx){if(rf & 1){i0.ɵɵlistener("click",()=>ctx.go());}}';
    const instructions=parseCompilerInstructions(code,'');
    expect(instructions.map(instruction=>instruction.phase)).toEqual(['creation','update','creation']);
  });
});

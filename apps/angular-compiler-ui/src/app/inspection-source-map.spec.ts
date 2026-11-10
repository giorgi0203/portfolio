import * as ts from 'typescript';
import { instrumentSource } from '../../preview/source-map';

describe('Preview source mapping',()=>{
  it('keeps original editor offsets after escaped newline, quote, unicode and line continuation',()=>{
    const sources=[
      String.raw`import {Component} from '@angular/core'; @Component({template:'<h2>Literal\nline</h2><button id="pick">{{count}}</button>'}) export class DemoComponent {count=0;}`,
      String.raw`import {Component} from '@angular/core'; @Component({template:'<h2>It\'s \u263A \x26 fine</h2><button id="pick">{{count}}</button>'}) export class DemoComponent {count=0;}`,
      "import {Component} from '@angular/core'; @Component({template:'<h2>Across\\\nlines</h2><button id=\"pick\">{{count}}</button>'}) export class DemoComponent {count=0;}"
    ];
    for(const source of sources){
      const result=instrumentSource(source),button=result.blocks.find(block=>block.tag==='button');
      expect(button).toBeDefined();
      expect(button?.start).toBe(source.indexOf('<button'));
      expect(button?.source).toBe(source.slice(button?.start,button?.end));
      expect(button?.end).toBe(source.indexOf('</button>')+'</button>'.length);
      const file=ts.createSourceFile('source.ts',source,ts.ScriptTarget.Latest,true);
      const position=file.getLineAndCharacterOfPosition(button!.start);
      expect(button?.startLine).toBe(position.line+1);expect(button?.startColumn).toBe(position.character+1);
      expect(result.source).toContain('data-lab-node');expect(result.unmappedComponents).toEqual([]);
    }
  });
  it('preserves Angular control and loop-local metadata without running handlers',()=>{
    const source=`import {Component} from '@angular/core';
@Component({template: \`@if(show) { @for(task of tasks;track task.id;let position=$index) {<button (click)="remove(task)">{{position}} {{task.title}}</button>} }\`})
export class DemoComponent {show=true;tasks=[{id:1,title:'One'}];remove(){throw new Error('Do not run while mapping');}}`;
    const result=instrumentSource(source),button=result.blocks.find(block=>block.tag==='button');
    expect(button?.component).toBe('DemoComponent');
    expect(button?.localNames.task).toBe('$implicit');expect(button?.localNames.position).toBe('$index');
    expect(button?.controls.some(control=>control.includes('@for'))).toBe(true);
    expect(button?.controls.some(control=>control.includes('@if'))).toBe(true);
    expect(button?.bindings).toContainEqual({kind:'event',name:'click',expression:'remove(task)'});
    expect(button?.source).toBe(source.slice(button?.start,button?.end));
  });
  it('keeps nearest-loop aliases and marks outer contexts as omitted',()=>{
    const source="import {Component} from '@angular/core'; @Component({template: `@for(group of groups;track group.id;let gi=$index){@for(item of group.items;track item.id;let ii=$index){<p>{{group.name}} {{item.name}}</p>}}`}) export class DemoComponent {groups=[];}";
    const paragraph=instrumentSource(source).blocks.find(block=>block.tag==='p');
    expect(paragraph?.localNames.item).toBe('$implicit');expect(paragraph?.localNames.ii).toBe('$index');
    expect(paragraph?.localNames.group).toBeUndefined();expect(paragraph?.localNames.gi).toBeUndefined();
    expect(paragraph?.outerLocalsOmitted).toBe(true);
  });
  it('distinguishes child component blocks with the same element tag',()=>{
    const source=`import {Component} from '@angular/core';
@Component({selector:'app-demo',template:'<button id="parent">Parent</button>'}) export class DemoComponent {}
@Component({selector:'child-demo',template:'<button id="child">Child</button>'}) export class ChildComponent {}`;
    const result=instrumentSource(source),buttons=result.blocks.filter(block=>block.tag==='button');
    expect(buttons.map(button=>button.component)).toEqual(['DemoComponent','ChildComponent']);
    expect(new Set(buttons.map(button=>button.id)).size).toBe(2);
    for(const button of buttons)expect(button.source).toBe(source.slice(button.start,button.end));
  });
  it('reports computed templates as unmapped instead of guessing a location',()=>{
    const source=`import {Component} from '@angular/core'; @Component({template:['<button>','Computed','</button>'].join('')}) export class DemoComponent {}`;
    const result=instrumentSource(source);
    expect(result.blocks).toEqual([]);expect(result.unmappedComponents).toEqual(['DemoComponent']);expect(result.source).toBe(source);
  });
  it('bounds the mapping payload for very large repeated source templates',()=>{
    const source=`import {Component} from '@angular/core'; @Component({template:${JSON.stringify('<p>{{value}}</p>'.repeat(220))}}) export class DemoComponent {value=1;}`;
    const result=instrumentSource(source);
    expect(result.truncated).toBe(true);expect(result.blocks.length).toBeLessThanOrEqual(180);
    expect(new Set(result.blocks.map(block=>block.id)).size).toBe(result.blocks.length);
  });
});

import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PreviewInspector } from '../../preview/inspector';
import type { MappedBlock } from '../../preview/source-map';
import type { InspectionActivity, InspectionSelection } from './inspection-types';

@Component({
  selector:'app-profile', standalone:true,
  template:'<strong data-lab-node="lab-child">{{ label }}</strong>'
})
class ScopeChild {
  @Input() label = '';
  marker = 'child marker';
}

@Component({
  selector:'app-scope-owner', standalone:true, imports:[ScopeChild],
  template:`<p data-lab-node="lab-parent">{{ marker }}</p>
    @for (profile of profiles; track profile) {
      <app-profile data-lab-node="lab-host" [label]="profile" />
    }`
})
class ScopeOwner {
  marker = 'parent marker';
  profiles = ['A', 'B'];
}

describe('linked preview inspection', () => {
  const block: MappedBlock = {
    id: 'lab-0-1', component: 'Demo', tag: 'p', start: 0, end: 3,
    startLine: 1, endLine: 1, startColumn: 1, endColumn: 4,
    source: '<p>', bindings: [], controls: [], localNames: {}
  };
  const mount = document.createElement('main');
  let inspector: PreviewInspector;
  let observer: MutationObserver;
  let selection: InspectionSelection | null;
  let activity: InspectionActivity | undefined;
  const rows = () => Array.from(mount.querySelectorAll('p'));
  const flush = () => inspector.rendered([], observer.takeRecords());
  beforeAll(() => {
    document.body.append(mount);
    inspector = new PreviewInspector(mount, (type, payload) => {
      if (type === 'learning:inspect') selection = payload['selection'] as InspectionSelection | null;
      if (type === 'learning:activity') activity = payload['activity'] as InspectionActivity;
    });
    observer = new MutationObserver(() => undefined);
  });
  beforeEach(() => {
    mount.innerHTML = '<p data-lab-node="lab-0-1">First</p><p data-lab-node="lab-0-1">Second</p>';
    inspector.reset([block]);
    inspector.setEnabled(true);
    activity = undefined;
    observer.observe(mount, {subtree:true, childList:true, attributeOldValue:true, characterDataOldValue:true});
  });
  afterEach(() => observer.disconnect());
  afterAll(() => mount.remove());

  it('retains the same repeated node across hover, workspace focus and reorder', () => {
    const [,second] = rows();
    second.dispatchEvent(new MouseEvent('pointerover', {bubbles: true}));
    expect(selection).toMatchObject({origin:'preview', text:'Second', instanceIndex:2, instanceCount:2});
    inspector.focusBlock(block.id);
    expect(selection).toMatchObject({origin:'workspace', text:'Second', instanceIndex:2, pinned:true});
    mount.prepend(second);
    flush();
    expect(selection).toMatchObject({origin:'workspace', text:'Second', instanceIndex:1});
    inspector.focusBlock(block.id, true, 2);
    expect(selection).toMatchObject({text:'First', instanceIndex:2});
    inspector.clearFocus();
    expect(selection).toBeNull();
    second.dispatchEvent(new FocusEvent('focusin', {bubbles:true}));
    expect(selection).toMatchObject({origin:'preview', text:'Second', pinned:false});
  });

  it('tracks the last DOM change per instance using the complete observed transition', () => {
    const [first,second] = rows();
    first.click();
    expect(activity).toMatchObject({kind:'event', eventName:'click'});
    const text = second.firstChild;
    if (!text) throw new Error('Missing text fixture');
    text.nodeValue = 'Intermediate';
    text.nodeValue = 'Updated';
    flush();
    expect(activity).toMatchObject({kind:'render', eventName:'', handler:''});
    expect(selection?.lastDomChange).toBeUndefined();
    inspector.focusBlock(block.id, true, 2);
    expect(selection?.lastDomChange).toEqual({name:'Text', before:'Second', after:'Updated'});
    second.setAttribute('title', 'A hint');
    flush();
    expect(selection?.lastDomChange).toEqual({name:'@title', before:'(absent)', after:'A hint'});
    second.setAttribute('title','New hint');
    second.removeAttribute('title');
    flush();
    expect(selection?.lastDomChange).toEqual({name:'@title', before:'A hint', after:'(absent)'});
    inspector.reset([block]);
    inspector.focusBlock(block.id, true, 2);
    expect(selection?.lastDomChange).toBeUndefined();
  });

  it('keeps distinct observed text changes for each source block in one render', () => {
    const [first,second] = rows();
    second.setAttribute('data-lab-node','other');
    inspector.reset([block, {...block,id:'other'}]);
    observer.takeRecords();
    const firstText=first.firstChild, secondText=second.firstChild;
    if(!firstText || !secondText)throw new Error('Missing fixture text');
    firstText.nodeValue='A';
    secondText.nodeValue='B';
    inspector.rendered([{name:'count',before:'0',after:'1'}],observer.takeRecords(),true,{count:'1'});
    expect(activity).toMatchObject({state:{count:'1'},blockId:null,domChangeCount:2,domChanges:[
      {blockId:block.id,tag:'p',name:'Text',before:'First',after:'A'},
      {blockId:'other',tag:'p',name:'Text',before:'Second',after:'B'},
    ]});
  });

  it('waits for the selected source block to render without borrowing another instance’s history', () => {
    mount.replaceChildren();
    inspector.focusBlock(block.id);
    expect(selection).toMatchObject({origin:'workspace', instanceIndex:0, instanceCount:0, text:''});
    const fresh = document.createElement('p');
    fresh.dataset['labNode'] = block.id;
    fresh.textContent = 'Revealed';
    mount.append(fresh);
    flush();
    expect(selection).toMatchObject({origin:'workspace', instanceIndex:1, instanceCount:1, text:'Revealed'});
    expect(selection?.lastDomChange).toBeUndefined();
  });

  it('does not label a removed pinned preview instance with the remaining row’s values', () => {
    const [,second] = rows();
    second.click();
    second.remove();
    flush();
    expect(selection).toMatchObject({origin:'preview', instanceIndex:0, instanceCount:1, text:'', values:{}});
    expect(selection?.reason).toContain('no longer rendered');
  });

  it('uses the declaring component and the current row for bindings on a child host', () => {
    const fixture=TestBed.createComponent(ScopeOwner);
    fixture.detectChanges();
    mount.replaceChildren(fixture.nativeElement);
    const host={...block,id:'lab-host',component:ScopeOwner.name,tag:'app-profile',localNames:{profile:'$implicit'}};
    inspector.reset([host, {...block,id:'lab-child',component:ScopeChild.name,tag:'strong'}, {...block,id:'lab-parent',component:ScopeOwner.name}]);
    inspector.focusBlock('lab-parent');
    expect(selection?.values['marker']).toBe('"parent marker"');
    inspector.focusBlock('lab-host',true,2);
    expect(selection).toMatchObject({component:ScopeOwner.name,instanceIndex:2,text:'B',values:{marker:'"parent marker"'},locals:{profile:'"B"'}});
    expect(selection?.values['label']).toBeUndefined();
    inspector.focusBlock('lab-child',true,2);
    expect(selection).toMatchObject({component:ScopeChild.name,values:{marker:'"child marker"',label:'"B"'}});
    inspector.reset([{...host,component:'Unconfirmed'}]);
    inspector.focusBlock('lab-host');
    expect(selection).toMatchObject({values:{},locals:{}});
  });
});

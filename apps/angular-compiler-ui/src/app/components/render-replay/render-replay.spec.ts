import { TestBed } from '@angular/core/testing';
import type { InspectionActivity } from '../../inspection-types';
import { RenderReplay, replayLimit } from './render-replay';

const observation=(id:number):InspectionActivity=>({
  id,kind:'render',phase:'Angular render pass completed',at:id,state:{count:String(id)},
  changes:[],domChanges:[],domChangeCount:0,eventName:'',handler:'',blockId:null,
});

it('holds an old frame while the live buffer rotates and drops it when a new run starts',()=>{
  const fixture=TestBed.createComponent(RenderReplay);
  const ref=fixture.componentRef;
  const observations=Array.from({length:replayLimit},(_,index)=>observation(index+1));
  ref.setInput('runId',1);
  ref.setInput('blocks',[]);
  ref.setInput('frames',observations);
  fixture.detectChanges();
  const root:HTMLElement=fixture.nativeElement;
  const slider=root.querySelector('input');
  if(!slider)throw new Error('Missing timeline');
  slider.value='2';slider.dispatchEvent(new Event('input'));fixture.detectChanges();
  expect(root.querySelector('.frame-title small')?.textContent).toBe('Frame 3');
  ref.setInput('frames',observations.map(frame=>observation(frame.id+100)));fixture.detectChanges();
  expect(root.textContent).toContain('Reviewing history');
  expect(root.querySelector('.frame-title small')?.textContent).toBe('Frame 3');
  ref.setInput('runId',2);ref.setInput('frames',[observation(1)]);fixture.detectChanges();
  expect(root.querySelector('.frame-title small')?.textContent).toBe('Frame 1');
  expect(root.textContent).toContain('Following live');
});

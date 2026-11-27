import { StreamDoctor, explainWait } from './stream-doctor';
const frag = {sequence:1,level:1,part:null,track:'main',start:2,duration:2,
  rendition:'Level 1 · 360p', url:'https://media.example/private/video.ts?token=abc#private'};
describe('Stream Doctor', () => {
  it('retains segment identity, start-of-wait evidence, transfer outcome and redacted origin', () => {
    const d = new StreamDoctor(), key={}, now=performance.now();
    d.finishWait('Playing', now);
    d.requested(key,frag);
    d.waiting(1.99,.01,'Level 0',false,false,now+1000);
    d.waiting(2,0,'Level 1',false,false,now+2000);
    d.finished(key,'Loaded',3014,200);
    d.finishWait('Playing',now+4000);
    expect(d.waits.length).toBe(1);
    const wait=d.waits[0];
    expect(wait).toMatchObject({kind:'Rebuffer',rendition:'Level 0',endedBy:'Playing'});
    expect(wait.durationMs).toBeCloseTo(3000, 6);
    expect(wait.segments[0]).toMatchObject({stateThen:'Loading',nearPosition:true,request:{
      sequence:1,state:'Loaded',downloadMs:3014,httpStatus:200,origin:'https://media.example',
    }});
    expect(explainWait(wait)).toContain('still loading');
    expect(JSON.stringify(wait)).not.toMatch(/private|token|video\.ts/);
  });
  it('distinguishes concurrent fetches, seek waits and unavailable native evidence', () => {
    const d=new StreamDoctor(),now=performance.now();
    d.requested({},frag);
    d.waiting(50,7,'Level 0',false,false,now);
    expect(d.waits[0].segments[0].nearPosition).toBe(false);
    expect(explainWait(d.waits[0])).toContain('do not identify');
    d.finishWait('Seek started',now+250);
    d.waiting(85,0,'Unavailable',true,true,now+260);
    expect(d.waits[0]).toMatchObject({kind:'Seeking',native:true});
    const native = new StreamDoctor();
    native.waiting(0,0,'Unavailable',true,false,now);
    expect(native.waits[0].segments.length).toBe(0);
  });
  it('associates later relevant attempts only during the open wait, and distinguishes their failure', () => {
    const d = new StreamDoctor(), key={}, now=performance.now();
    d.waiting(2.1,0,'Level 1',false,false,now);
    d.requested(key,frag); d.finished(key,'Failed',120,404);
    d.finishWait('Paused',now+150);
    d.requested(key,frag);d.finished(key,'Loaded',22,200);
    expect(d.waits[0].segments).toHaveLength(1);
    expect(d.waits[0].segments[0]).toMatchObject({when:'During wait',request:{state:'Failed',httpStatus:404}});
    expect(explainWait(d.waits[0])).toContain('failed');
  });
  it('does not blame an old failed attempt when a retry has already succeeded', () => {
    const d=new StreamDoctor(), first={}, second={}, now=performance.now();
    d.requested(first,frag);d.finished(first,'Failed',40,500,now+40);
    d.requested(second,frag);d.finished(second,'Loaded',30,200,now+100);
    d.waiting(2.1,0,'Level 1',false,false,now+200);
    const wait=d.waits[0];
    expect(wait.segments.map(s=>s.request.state)).toEqual(['Loaded']);
    expect(explainWait(wait)).not.toContain('failed');
  });
  it('bounds samples and recorded waits during long sessions', () => {
    const d=new StreamDoctor(),now=performance.now();
    for(let i=0;i<130;i++) {
      d.sample(i,now+i*1000);d.sample(i,now+i*1000+100);
      d.waiting(i,0,'Unavailable',true,false,now+i*1000);d.finishWait('Playing',now+i*1000+200);
    }
    expect(d.buffer.length).toBe(60);expect(d.buffer[0].seconds).toBe(70);
    expect(d.waits.length).toBe(24);expect(d.waits[0].position).toBe(129);
  });
});

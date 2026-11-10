import { Injectable } from '@angular/core';
@Injectable({providedIn:'root'})
export class AnalyticsService {
  private started=false;
  start(){
    if(this.started)return;this.started=true;
    if(navigator.doNotTrack==='1'||(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl)return;
    let referrer='';try{referrer=new URL(document.referrer).hostname;}catch{ /* Direct visit. */ }
    const send=(kind:'pageview'|'outbound',label:string)=>{
      const body=JSON.stringify({kind,label,referrer});
      if(navigator.sendBeacon?.('/api/analytics/event',new Blob([body],{type:'application/json'})))return;
      void fetch('/api/analytics/event',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,credentials:'omit'}).catch(()=>undefined);
    };
    if(location.pathname==='/')send('pageview','home');
    document.addEventListener('click',event=>{
      const anchor=(event.target as Element|null)?.closest('a[href]');if(!anchor)return;
      try{const host=new URL((anchor as HTMLAnchorElement).href).hostname;
        if(['hls-player.giorgi.app','smart-todolist.giorgi.app','www.facebook.com','www.linkedin.com','github.com','www.instagram.com'].includes(host))send('outbound',host);
      }catch{ /* Ignore non-URL links. */ }
    },{capture:true});
  }
}

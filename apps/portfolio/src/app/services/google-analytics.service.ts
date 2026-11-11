import { Injectable, signal } from '@angular/core';
type Choice='allow'|'deny';
type AnalyticsWindow=Window & {dataLayer?:unknown[];gtag?:(...args:unknown[])=>void;[key:string]:unknown};
@Injectable({providedIn:'root'})
export class GoogleAnalyticsService {
 readonly available=signal(false);readonly showChoice=signal(false);readonly allowed=signal(false);
 private id='';private loaded=false;private readonly key='giorgi-google-analytics-consent-v1';
 async start(){
  if(!['giorgi.app','www.giorgi.app'].includes(location.hostname))return;
  try{const response=await fetch('/analytics-config.json',{cache:'no-store'});if(!response.ok)return;const config=await response.json();if(typeof config.measurementId!=='string'||!/^G-[A-Z0-9]{4,20}$/.test(config.measurementId))return;this.id=config.measurementId;this.available.set(true);
   const choice=this.read();if(this.privacySignal()){this.allowed.set(false);return;}if(choice==='allow')this.enable();else if(choice!=='deny')this.showChoice.set(true);
  }catch{ /* Optional analytics must never block the portfolio. */ }
 }
 settings(){this.showChoice.set(true);}
 choose(choice:Choice){try{localStorage.setItem(this.key,choice);}catch{ /* Choice still applies to this page. */ }this.showChoice.set(false);
  if(choice==='allow'&&!this.privacySignal()){this.enable();return;}
  this.allowed.set(false);if(this.id)(window as unknown as AnalyticsWindow)['ga-disable-'+this.id]=true;
  for(const name of ['_ga','_ga_'+this.id.slice(2)])document.cookie=name+'=; Max-Age=0; Path=/; Secure; SameSite=Lax';
  if(this.loaded)location.reload();
 }
 private read(){try{return localStorage.getItem(this.key);}catch{return null;}}
 private privacySignal(){return navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl===true;}
 private enable(){
  this.allowed.set(true);if(this.loaded)return;this.loaded=true;
  const w=window as unknown as AnalyticsWindow;w['ga-disable-'+this.id]=false;w.dataLayer=w.dataLayer||[];const queue=w.dataLayer;w.gtag=function(){
    // Google’s command queue uses the function arguments object.
    // eslint-disable-next-line prefer-rest-params
    queue.push(arguments);
  };
  w.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  w.gtag('consent','update',{analytics_storage:'granted'});w.gtag('js',new Date());
  w.gtag('config',this.id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,cookie_domain:'none',cookie_expires:7776000,page_location:'https://giorgi.app/',ignore_referrer:true});
  let referrer='';try{referrer=new URL(document.referrer).origin;}catch{ /* Direct visit. */ }
  w.gtag('event','page_view',{page_location:'https://giorgi.app/',page_title:document.title,page_referrer:referrer});
  const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+this.id;document.head.append(script);
  document.addEventListener('click',event=>{if(!this.allowed())return;const anchor=(event.target as Element|null)?.closest('a[href]') as HTMLAnchorElement|null;if(!anchor)return;try{const url=new URL(anchor.href);if(url.protocol==='https:'&&url.hostname!==location.hostname)w.gtag?.('event','outbound_click',{destination_host:url.hostname,page_location:'https://giorgi.app/'});}catch{ /* Non-web link. */ }},{capture:true});
 }
}

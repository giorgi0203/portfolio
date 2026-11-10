import('./bootstrap').catch((err) => console.error(err));


// Shared account entry and cookie-free site analytics; playback stays public.
if(navigator.doNotTrack!=='1'&&!(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl){
 let referrer='';try{referrer=new URL(document.referrer).hostname;}catch{ /* Direct visit. */ }
 void fetch('https://auth.giorgi.app/api/analytics/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'pageview',label:'home',referrer}),keepalive:true,credentials:'omit'}).catch(()=>undefined);
}
const account=document.createElement('a');account.href='https://auth.giorgi.app/?continue='+encodeURIComponent('https://hls-player.giorgi.app/');account.textContent='Giorgi account · Sign in';account.style.cssText='display:block;width:fit-content;margin:10px 16px 0 auto;background:#233c33;color:#e5f2dc;border:1px solid #78916f;border-radius:8px;padding:8px 12px;font:12px Arial;text-decoration:none';document.body.prepend(account);
void fetch('https://auth.giorgi.app/api/auth/session',{credentials:'include'}).then(r=>r.json()).then(({user})=>{if(user){account.textContent='Giorgi account · '+user.name;account.href='https://auth.giorgi.app/account';}}).catch(()=>undefined);

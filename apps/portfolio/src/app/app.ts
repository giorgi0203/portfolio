import { DomSanitizer } from '@angular/platform-browser';
import { GoogleAnalyticsService } from './services/google-analytics.service';
import { AnalyticsService } from './services/analytics.service';
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { deployedApps } from './deployed-apps';

@Component({
  selector: 'app-root',
  imports: [RouterModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  @ViewChild('ownerDialog') ownerDialog!:ElementRef<HTMLDialogElement>;
  @ViewChild('identityFrame') identityFrame?:ElementRef<HTMLIFrameElement>;
  loginOpen=false;
  identityStatus:'loading'|'ready'|'failed'='loading';
  private identityTimer?:ReturnType<typeof setTimeout>;
  private readonly sanitizer=inject(DomSanitizer);
  authEmbed=this.sanitizer.bypassSecurityTrustResourceUrl('https://auth.giorgi.app/embed?parent='+encodeURIComponent(location.origin));
  private readonly shortcut=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if((event.metaKey||event.ctrlKey)&&event.code==='Period'&&!target?.closest('input,textarea,[contenteditable="true"]')){event.preventDefault();this.openOwnerLogin();}};
  private readonly identityMessage=(event:MessageEvent)=>{if(event.origin!=='https://auth.giorgi.app'||event.source!==this.identityFrame?.nativeElement.contentWindow)return;if(event.data?.type==='giorgi:ready'){clearTimeout(this.identityTimer);this.identityStatus='ready';return;}if(event.data?.type==='giorgi:close'){this.closeOwnerLogin();return;}if(event.data?.type==='giorgi:authenticated'){this.closeOwnerLogin();location.assign('https://auth.giorgi.app/analytics');}};
  openOwnerLogin(){if(this.loginOpen)return;this.loginOpen=true;this.retryOwnerLogin();this.ownerDialog.nativeElement.showModal();}
  retryOwnerLogin(){clearTimeout(this.identityTimer);this.identityStatus='loading';this.authEmbed=this.sanitizer.bypassSecurityTrustResourceUrl('https://auth.giorgi.app/embed?parent='+encodeURIComponent(location.origin)+'&attempt='+Date.now());this.identityTimer=setTimeout(()=>{this.identityStatus='failed';},10000);}
  ownerLoginClosed(){clearTimeout(this.identityTimer);this.loginOpen=false;}
  closeOwnerLogin(){this.ownerLoginClosed();this.ownerDialog.nativeElement.close();}
  ngOnDestroy(){clearTimeout(this.identityTimer);window.removeEventListener('keydown',this.shortcut);window.removeEventListener('message',this.identityMessage);}

  readonly googleAnalytics=inject(GoogleAnalyticsService);
  private readonly analytics=inject(AnalyticsService);
  ngOnInit(){this.analytics.start();void this.googleAnalytics.start();window.addEventListener('keydown',this.shortcut);window.addEventListener('message',this.identityMessage);}
  readonly deployedApps = deployedApps;
}

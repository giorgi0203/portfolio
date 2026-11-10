import { DomSanitizer } from '@angular/platform-browser';
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
  readonly authEmbed=inject(DomSanitizer).bypassSecurityTrustResourceUrl('https://auth.giorgi.app/embed?parent='+encodeURIComponent(location.origin));
  private readonly shortcut=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if((event.metaKey||event.ctrlKey)&&event.code==='Period'&&!target?.closest('input,textarea,[contenteditable="true"]')){event.preventDefault();this.openOwnerLogin();}};
  private readonly identityMessage=(event:MessageEvent)=>{if(event.origin!=='https://auth.giorgi.app'||event.source!==this.identityFrame?.nativeElement.contentWindow)return;if(event.data?.type==='giorgi:close'){this.closeOwnerLogin();return;}if(event.data?.type==='giorgi:authenticated'){this.closeOwnerLogin();location.assign('https://auth.giorgi.app/analytics');}};
  openOwnerLogin(){this.loginOpen=true;this.ownerDialog.nativeElement.showModal();}
  closeOwnerLogin(){this.loginOpen=false;this.ownerDialog.nativeElement.close();}
  ngOnDestroy(){window.removeEventListener('keydown',this.shortcut);window.removeEventListener('message',this.identityMessage);}

  private readonly analytics=inject(AnalyticsService);
  ngOnInit(){this.analytics.start();window.addEventListener('keydown',this.shortcut);window.addEventListener('message',this.identityMessage);}
  readonly deployedApps = deployedApps;
}

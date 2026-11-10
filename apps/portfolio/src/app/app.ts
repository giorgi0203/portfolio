import { AnalyticsService } from './services/analytics.service';
import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { deployedApps } from './deployed-apps';

@Component({
  selector: 'app-root',
  imports: [RouterModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly analytics=inject(AnalyticsService);
  ngOnInit(){this.analytics.start();}
  readonly deployedApps = deployedApps;
}

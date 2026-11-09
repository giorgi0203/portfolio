import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { deployedApps } from './deployed-apps';

@Component({
  selector: 'app-root',
  imports: [RouterModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly deployedApps = deployedApps;
}

import { Component } from '@angular/core';
import { deployedApps } from '../deployed-apps';

type AppFilter = 'all' | 'useful' | 'play';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  readonly projects = deployedApps;
  readonly year = new Date().getFullYear();
  readonly filters: { value: AppFilter; label: string }[] = [
    { value: 'all', label: 'Everything' },
    { value: 'useful', label: 'Useful-ish' },
    { value: 'play', label: 'Just for fun' },
  ];
  activeFilter: AppFilter = 'all';
  catApproved = false;
  private ideaIndex = 0;
  private readonly ideas = [
    'Something that finally earns its own hosting bill.',
    'A tiny tool that saves a surprisingly annoying amount of time.',
    'An idea that starts with “what if…” and ends at 2 a.m.',
    'A useful little thing people actually come back to.',
  ];

  get visibleProjects() {
    return this.projects.filter(
      (project) =>
        this.activeFilter === 'all' || project.category === this.activeFilter,
    );
  }

  get currentIdea() {
    return this.ideas[this.ideaIndex];
  }

  nextIdea() {
    this.ideaIndex = (this.ideaIndex + 1) % this.ideas.length;
  }
}

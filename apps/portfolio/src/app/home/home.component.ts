import { FormsModule } from '@angular/forms';
import { Component } from '@angular/core';
import { deployedApps } from '../deployed-apps';

type AppFilter = 'all' | 'useful' | 'play';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  readonly socials = [
    { name: 'Facebook', url: 'https://www.facebook.com/share/19jeuyZ9x3/', mark: 'f' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/in/giorgi-arabuli/', mark: 'in' },
    { name: 'GitHub', url: 'https://github.com/giorgi0203', mark: 'GH' },
    { name: 'Instagram', url: 'https://www.instagram.com/giorgi_gio_arabuli/', mark: '◎' },
  ];
  contact = { name: '', email: '', message: '', website: '' };
  sending = false;
  contactSuccess = '';
  contactError = '';
  async sendMessage() {
    if (this.sending) return;
    this.sending = true; this.contactError = ''; this.contactSuccess = '';
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.contact), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Please try again later.');
      this.contactSuccess = result.message;
      this.contact = { name: '', email: '', message: '', website: '' };
    } catch (error) {
      this.contactError = error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Sending took too long. Please try a social link or retry later.';
    } finally { this.sending = false; }
  }
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

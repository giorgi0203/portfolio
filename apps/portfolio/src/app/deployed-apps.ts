import type { Project } from './services/api.service';

export interface DeployedApp extends Project {
  category: 'useful' | 'play';
  label: string;
}

/** Add a new deployed app here to include it in the navigation and junk drawer. */
export const deployedApps: DeployedApp[] = [
  {
    id: 1,
    title: 'HLS Player',
    description:
      'A little player for your HLS streams. Pick a quality, hit play, and get pleasantly distracted.',
    technologies: ['Angular', 'HLS.js', 'TypeScript'],
    githubUrl:
      'https://github.com/giorgi0203/portfolio/tree/main/apps/hls-player',
    liveUrl: 'https://hls-player.giorgi.app/',
    imageUrl: '/assets/hls-player.svg',
    category: 'play',
    label: 'VIDEO & DISTRACTIONS',
  },
  {
    id: 2,
    title: 'Smart Todo List',
    description:
      'For when the ideas arrive faster than you can finish them. A task list with an AI sidekick.',
    technologies: ['Next.js', 'React', 'CopilotKit'],
    githubUrl: 'https://github.com/giorgi0203/smart-todolist',
    liveUrl: 'https://smart-todolist.giorgi.app/',
    imageUrl: '/assets/smart-todolist.svg',
    category: 'useful',
    label: 'ORGANIZED CHAOS',
  },
];

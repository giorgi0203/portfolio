import type { Project } from './services/api.service';

/** Public applications hosted on this domain, independent of the portfolio API. */
export const deployedApps: Project[] = [
  {
    id: 1,
    title: 'HLS Player',
    description: 'Play HLS streams in your browser with quality, audio, and playback controls.',
    technologies: ['Angular', 'HLS.js', 'TypeScript'],
    githubUrl: 'https://github.com/giorgi0203/portfolio/tree/main/apps/hls-player',
    liveUrl: 'https://hls-player.giorgi.app/',
    imageUrl: '/assets/hls-player.svg',
  },
  {
    id: 2,
    title: 'Smart Todo List',
    description: 'A dedicated space for organizing tasks and planning what to do next.',
    technologies: ['Next.js', 'React'],
    githubUrl: 'https://github.com/giorgi0203/smart-todolist',
    liveUrl: 'https://smart-todolist.giorgi.app/',
    imageUrl: '/assets/smart-todolist.svg',
  },
];

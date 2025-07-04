import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { trigger, state, style, transition, animate, stagger, query } from '@angular/animations';

@Component({
  imports: [RouterModule, CommonModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('600ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('slideInLeft', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-50px)' }),
        animate('800ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('slideInRight', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(50px)' }),
        animate('800ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('staggerAnimation', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(30px)' }),
          stagger('100ms', [
            animate('600ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class App {
  protected title = 'Portfolio';
  
  // Portfolio data
  skills = [
    { name: 'Angular', level: 95, icon: '⚡' },
    { name: 'TypeScript', level: 90, icon: '🎯' },
    { name: 'Node.js', level: 85, icon: '🚀' },
    { name: 'NestJS', level: 88, icon: '🔥' },
    { name: 'MongoDB', level: 80, icon: '🍃' },
    { name: 'PostgreSQL', level: 82, icon: '🐘' }
  ];

  projects = [
    {
      title: 'E-Commerce Platform',
      description: 'Full-stack e-commerce solution with Angular, NestJS, and PostgreSQL',
      image: 'https://via.placeholder.com/400x250/667eea/ffffff?text=E-Commerce+Platform',
      technologies: ['Angular', 'NestJS', 'PostgreSQL', 'Stripe'],
      demoUrl: '#',
      codeUrl: '#'
    },
    {
      title: 'Task Management App',
      description: 'Collaborative task management with real-time updates',
      image: 'https://via.placeholder.com/400x250/764ba2/ffffff?text=Task+Management',
      technologies: ['Angular', 'Socket.IO', 'MongoDB', 'Express'],
      demoUrl: '#',
      codeUrl: '#'
    },
    {
      title: 'Analytics Dashboard',
      description: 'Data visualization dashboard with interactive charts',
      image: 'https://via.placeholder.com/400x250/f093fb/ffffff?text=Analytics+Dashboard',
      technologies: ['Angular', 'D3.js', 'Firebase', 'Chart.js'],
      demoUrl: '#',
      codeUrl: '#'
    }
  ];

  aboutMe = {
    name: 'Your Name',
    title: 'Full Stack Developer',
    description: `I'm a passionate full-stack developer with expertise in modern web technologies. 
    I love creating beautiful, responsive applications that solve real-world problems. 
    With a strong foundation in Angular, NestJS, and database technologies, I build 
    scalable and maintainable solutions.`,
    location: 'Your Location',
    email: 'your.email@example.com',
    github: 'https://github.com/yourusername',
    linkedin: 'https://linkedin.com/in/yourusername'
  };

  // Animated background particles
  particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 1,
    speed: Math.random() * 2 + 1
  }));

  scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }

  downloadResume(): void {
    // Add your resume download logic here
    console.log('Download resume clicked');
  }

  contactMe(): void {
    // Add contact form logic here
    console.log('Contact me clicked');
  }
}

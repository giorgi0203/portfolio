import { Injectable } from '@nestjs/common';
import { Project, Skill, ContactRequest, ContactResponse } from 'shared-types';

@Injectable()
export class AppService {
  getProjects(): Project[] {
    return [
      {
        id: 1,
        title: 'Portfolio Website',
        description:
          'A modern, responsive portfolio website built with Angular and NestJS',
        technologies: ['Angular', 'NestJS', 'TypeScript', 'Tailwind CSS', 'Nx'],
        githubUrl: 'https://github.com/giorgi0203/portfolio',
        liveUrl: 'https://giorgi.app',
        imageUrl: '/assets/portfolio-preview.jpg',
      },
      {
        id: 2,
        title: 'E-Commerce Platform',
        description: 'Full-stack e-commerce solution with payment integration',
        technologies: ['React', 'Node.js', 'MongoDB', 'Stripe'],
        githubUrl: 'https://github.com/giorgi0203/ecommerce',
        imageUrl: '/assets/ecommerce-preview.jpg',
      },
      {
        id: 3,
        title: 'Task Management App',
        description: 'Real-time collaborative task management application',
        technologies: ['Vue.js', 'Express.js', 'Socket.io', 'PostgreSQL'],
        githubUrl: 'https://github.com/giorgi0203/taskmanager',
        imageUrl: '/assets/taskmanager-preview.jpg',
      },
    ];
  }

  getSkills(): Skill[] {
    return [
      // Frontend
      { id: 1, name: 'Angular', category: 'Frontend', level: 90 },
      { id: 2, name: 'React', category: 'Frontend', level: 85 },
      { id: 3, name: 'Vue.js', category: 'Frontend', level: 80 },
      { id: 4, name: 'TypeScript', category: 'Frontend', level: 95 },
      { id: 5, name: 'JavaScript', category: 'Frontend', level: 95 },
      { id: 6, name: 'HTML/CSS', category: 'Frontend', level: 90 },
      { id: 7, name: 'Tailwind CSS', category: 'Frontend', level: 85 },

      // Backend
      { id: 8, name: 'NestJS', category: 'Backend', level: 85 },
      { id: 9, name: 'Node.js', category: 'Backend', level: 90 },
      { id: 10, name: 'Express.js', category: 'Backend', level: 85 },
      { id: 11, name: 'Python', category: 'Backend', level: 80 },
      { id: 12, name: 'C#/.NET', category: 'Backend', level: 75 },

      // Database
      { id: 13, name: 'PostgreSQL', category: 'Database', level: 85 },
      { id: 14, name: 'MongoDB', category: 'Database', level: 80 },
      { id: 15, name: 'MySQL', category: 'Database', level: 75 },

      // DevOps
      { id: 16, name: 'Docker', category: 'DevOps', level: 80 },
      { id: 17, name: 'AWS', category: 'DevOps', level: 75 },
      { id: 18, name: 'Git', category: 'DevOps', level: 90 },
      { id: 19, name: 'CI/CD', category: 'DevOps', level: 80 },
    ];
  }

  submitContact(contactData: ContactRequest): ContactResponse {
    // Here you would typically save to database or send email
    console.log('Contact form submission:', contactData);

    // Basic validation
    if (!contactData.name || !contactData.email || !contactData.message) {
      return {
        message: 'Please fill in all required fields',
        success: false,
      };
    }

    // TODO: Implement actual email sending or database storage
    return {
      message: 'Thank you for your message! I will get back to you soon.',
      success: true,
    };
  }
}

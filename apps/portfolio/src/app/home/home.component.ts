import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { trigger, style, transition, animate, stagger, query } from '@angular/animations';
import { ApiService, Skill, ContactFormData } from '../services/api.service';
import { deployedApps } from '../deployed-apps';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
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
export class HomeComponent implements OnInit {
  projects = deployedApps;
  skills: Skill[] = [];
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);
  
  contactForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    subject: [''],
    message: ['', [Validators.required]]
  });
  contactSubmitting = false;
  contactMessage = '';

  aboutMe = {
    name: 'Giorgi Arabuli',
    title: 'Full Stack Developer',
    description: `I'm a passionate full-stack developer with expertise in modern web technologies. 
                  I love creating innovative solutions that solve real-world problems and deliver 
                  exceptional user experiences.`,
    experience: '5+ years',
    projects: '50+',
    technologies: '15+',
    location: 'Your Location',
    email: 'giorgi@example.com',
    github: 'https://github.com/giorgi0203',
    linkedin: 'https://linkedin.com/in/giorgi-arabuli'
  };

  ngOnInit() {
    this.loadSkills();
  }

  loadSkills() {
    this.apiService.getSkills().subscribe({
      next: (skills) => {
        this.skills = skills;
      },
      error: (error) => {
        console.error('Error loading skills:', error);
        this.skills = [
          { id: 1, name: 'Angular', category: 'Frontend', level: 95, icon: '🅰️' },
          { id: 2, name: 'TypeScript', category: 'Frontend', level: 90, icon: '📘' },
          { id: 3, name: 'Node.js', category: 'Backend', level: 85, icon: '🟢' },
          { id: 4, name: 'Express.js', category: 'Backend', level: 88, icon: '⚡' }
        ];
      }
    });
  }

  onSubmitContact() {
    if (this.contactForm.valid) {
      this.contactSubmitting = true;
      const formData: ContactFormData = this.contactForm.value;

      this.apiService.submitContact(formData).subscribe({
        next: (response) => {
          this.contactMessage = response.message;
          this.contactSubmitting = false;
          if (response.success) {
            this.contactForm.reset();
          }
        },
        error: (error) => {
          console.error('Error submitting contact form:', error);
          this.contactMessage = 'Sorry, there was an error sending your message. Please try again.';
          this.contactSubmitting = false;
        }
      });
    }
  }

  scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }

  downloadResume(): void {
    console.log('Download resume clicked');
  }
}

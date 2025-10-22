import { Test } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = app.get<AppService>(AppService);
  });

  describe('getProjects', () => {
    it('should return an array of projects', () => {
      const projects = service.getProjects();
      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThan(0);
      expect(projects[0]).toHaveProperty('id');
      expect(projects[0]).toHaveProperty('title');
      expect(projects[0]).toHaveProperty('description');
      expect(projects[0]).toHaveProperty('technologies');
    });
  });

  describe('getSkills', () => {
    it('should return an array of skills', () => {
      const skills = service.getSkills();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0]).toHaveProperty('id');
      expect(skills[0]).toHaveProperty('name');
      expect(skills[0]).toHaveProperty('category');
      expect(skills[0]).toHaveProperty('level');
    });
  });

  describe('submitContact', () => {
    it('should return success response for valid contact data', () => {
      const contactData = {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Test Subject',
        message: 'Test message'
      };
      
      const response = service.submitContact(contactData);
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('message');
    });

    it('should return error response for invalid contact data', () => {
      const contactData = {
        name: '',
        email: 'john@example.com',
        subject: 'Test Subject',
        message: ''
      };
      
      const response = service.submitContact(contactData);
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('message');
    });
  });
});

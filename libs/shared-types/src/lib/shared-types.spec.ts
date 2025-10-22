import { Project, Skill, ContactRequest, ContactResponse, HealthResponse } from './shared-types';

describe('shared-types', () => {
  describe('Project interface', () => {
    it('should define a valid project structure', () => {
      const project: Project = {
        id: 1,
        title: 'Test Project',
        description: 'A test project',
        technologies: ['TypeScript', 'Angular'],
        githubUrl: 'https://github.com/test/repo',
        liveUrl: 'https://test.com',
        imageUrl: '/assets/test.jpg'
      };

      expect(project.id).toBe(1);
      expect(project.title).toBe('Test Project');
      expect(Array.isArray(project.technologies)).toBe(true);
    });

    it('should allow optional properties to be undefined', () => {
      const project: Project = {
        id: 1,
        title: 'Minimal Project',
        description: 'A minimal project',
        technologies: ['TypeScript']
      };

      expect(project.githubUrl).toBeUndefined();
      expect(project.liveUrl).toBeUndefined();
      expect(project.imageUrl).toBeUndefined();
    });
  });

  describe('Skill interface', () => {
    it('should define a valid skill structure', () => {
      const skill: Skill = {
        id: 1,
        name: 'Angular',
        category: 'Frontend',
        level: 90
      };

      expect(skill.id).toBe(1);
      expect(skill.name).toBe('Angular');
      expect(skill.category).toBe('Frontend');
      expect(skill.level).toBe(90);
    });

    it('should validate level is a number', () => {
      const skill: Skill = {
        id: 1,
        name: 'React',
        category: 'Frontend',
        level: 85
      };

      expect(typeof skill.level).toBe('number');
      expect(skill.level).toBeGreaterThanOrEqual(1);
      expect(skill.level).toBeLessThanOrEqual(100);
    });
  });

  describe('ContactRequest interface', () => {
    it('should define a valid contact request structure', () => {
      const contactRequest: ContactRequest = {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Test Subject',
        message: 'Test message'
      };

      expect(contactRequest.name).toBe('John Doe');
      expect(contactRequest.email).toBe('john@example.com');
      expect(contactRequest.subject).toBe('Test Subject');
      expect(contactRequest.message).toBe('Test message');
    });
  });

  describe('ContactResponse interface', () => {
    it('should define a valid contact response structure', () => {
      const contactResponse: ContactResponse = {
        message: 'Thank you for your message!',
        success: true
      };

      expect(contactResponse.message).toBe('Thank you for your message!');
      expect(contactResponse.success).toBe(true);
    });
  });

  describe('HealthResponse interface', () => {
    it('should define a valid health response structure', () => {
      const healthResponse: HealthResponse = {
        status: 'ok',
        timestamp: '2025-10-23T00:00:00.000Z'
      };

      expect(healthResponse.status).toBe('ok');
      expect(healthResponse.timestamp).toBe('2025-10-23T00:00:00.000Z');
    });
  });
});

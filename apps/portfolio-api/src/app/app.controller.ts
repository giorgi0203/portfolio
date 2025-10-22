import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AppService } from './app.service';
import { ContactRequest } from 'shared-types';

@ApiTags('portfolio')
@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Server is healthy' })
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('projects')
  @ApiOperation({ summary: 'Get all portfolio projects' })
  @ApiResponse({ status: 200, description: 'List of portfolio projects' })
  getProjects() {
    return this.appService.getProjects();
  }

  @Get('skills')
  @ApiOperation({ summary: 'Get all skills and proficiency levels' })
  @ApiResponse({ status: 200, description: 'List of skills with proficiency levels' })
  getSkills() {
    return this.appService.getSkills();
  }

  @Post('contact')
  @ApiOperation({ summary: 'Submit contact form' })
  @ApiBody({ 
    description: 'Contact form data',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'John Doe' },
        email: { type: 'string', example: 'john@example.com' },
        subject: { type: 'string', example: 'Project Inquiry' },
        message: { type: 'string', example: 'I would like to discuss a project...' }
      },
      required: ['name', 'email', 'message']
    }
  })
  @ApiResponse({ status: 201, description: 'Contact form submitted successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - missing required fields' })
  submitContact(@Body() contactData: ContactRequest) {
    return this.appService.submitContact(contactData);
  }
}

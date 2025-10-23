/**
 * Express Portfolio API Server
 */

import express from 'express';
import cors from 'cors';

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:4200', 'https://giorgi.app'],
  credentials: true,
}));

// Swagger documentation
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Portfolio API',
    description: 'API endpoints for the portfolio website',
    version: '1.0.0'
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Development server' },
    { url: 'https://giorgi.app', description: 'Production server' }
  ],
  tags: [
    { name: 'portfolio', description: 'Portfolio related endpoints' }
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['portfolio'],
        summary: 'Health check endpoint',
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    timestamp: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/projects': {
      get: {
        tags: ['portfolio'],
        summary: 'Get all portfolio projects',
        responses: {
          '200': {
            description: 'List of portfolio projects',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      title: { type: 'string' },
                      description: { type: 'string' },
                      technologies: { type: 'array', items: { type: 'string' } },
                      githubUrl: { type: 'string' },
                      liveUrl: { type: 'string' },
                      imageUrl: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/skills': {
      get: {
        tags: ['portfolio'],
        summary: 'Get all skills and proficiency levels',
        responses: {
          '200': {
            description: 'List of skills with proficiency levels',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      name: { type: 'string' },
                      category: { type: 'string' },
                      level: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/contact': {
      post: {
        tags: ['portfolio'],
        summary: 'Submit contact form',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'message'],
                properties: {
                  name: { type: 'string', example: 'John Doe' },
                  email: { type: 'string', format: 'email', example: 'john@example.com' },
                  subject: { type: 'string', example: 'Project Inquiry' },
                  message: { type: 'string', example: 'I would like to discuss a project...' }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Contact form submitted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    success: { type: 'boolean' }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request - missing required fields',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    success: { type: 'boolean' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Serve Swagger JSON spec
app.get('/api/docs.json', (req, res) => {
  res.json(swaggerDocument);
});

// Simple HTML page for API docs
app.get('/api/docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Portfolio API Documentation</title>
      <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
      <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin:0; background: #fafafa; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
      <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            url: '/api/docs.json',
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout"
          });
        };
      </script>
    </body>
    </html>
  `);
});

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Projects endpoint
app.get('/api/projects', (req, res) => {
  res.json([
    {
      id: 1,
      title: "Portfolio Website",
      description: "A modern, responsive portfolio website built with Angular and Express",
      technologies: ["Angular", "Express.js", "TypeScript", "Tailwind CSS", "Nx"],
      githubUrl: "https://github.com/giorgi0203/portfolio",
      liveUrl: "https://giorgi.app",
      imageUrl: "/assets/portfolio-preview.jpg"
    },
    {
      id: 2,
      title: "E-Commerce Platform",
      description: "Full-stack e-commerce solution with payment integration",
      technologies: ["React", "Node.js", "MongoDB", "Stripe"],
      githubUrl: "https://github.com/giorgi0203/ecommerce",
      imageUrl: "/assets/ecommerce-preview.jpg"
    },
    {
      id: 3,
      title: "Task Management App",
      description: "Real-time collaborative task management application",
      technologies: ["Vue.js", "Express.js", "Socket.io", "PostgreSQL"],
      githubUrl: "https://github.com/giorgi0203/taskmanager",
      imageUrl: "/assets/taskmanager-preview.jpg"
    }
  ]);
});

// Skills endpoint
app.get('/api/skills', (req, res) => {
  res.json([
    { id: 1, name: "Angular", category: "Frontend", level: 90 },
    { id: 2, name: "React", category: "Frontend", level: 85 },
    { id: 3, name: "Vue.js", category: "Frontend", level: 80 },
    { id: 4, name: "TypeScript", category: "Frontend", level: 95 },
    { id: 5, name: "JavaScript", category: "Frontend", level: 95 },
    { id: 6, name: "HTML/CSS", category: "Frontend", level: 90 },
    { id: 7, name: "Tailwind CSS", category: "Frontend", level: 85 },
    { id: 8, name: "Express.js", category: "Backend", level: 90 },
    { id: 9, name: "Node.js", category: "Backend", level: 90 },
    { id: 10, name: "Fastify", category: "Backend", level: 85 },
    { id: 11, name: "Python", category: "Backend", level: 80 },
    { id: 12, name: "C#/.NET", category: "Backend", level: 75 },
    { id: 13, name: "PostgreSQL", category: "Database", level: 85 },
    { id: 14, name: "MongoDB", category: "Database", level: 80 },
    { id: 15, name: "MySQL", category: "Database", level: 75 },
    { id: 16, name: "Docker", category: "DevOps", level: 80 },
    { id: 17, name: "AWS", category: "DevOps", level: 75 },
    { id: 18, name: "Git", category: "DevOps", level: 90 },
    { id: 19, name: "CI/CD", category: "DevOps", level: 80 }
  ]);
});

// Contact endpoint
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body;
  
  console.log('Contact form submission:', { name, email, message });
  
  if (!name || !email || !message) {
    return res.status(400).json({
      message: 'Please fill in all required fields',
      success: false
    });
  }
  
  res.status(201).json({
    message: 'Thank you for your message! I will get back to you soon.',
    success: true
  });
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation available at: http://localhost:${port}/api/docs`);
});

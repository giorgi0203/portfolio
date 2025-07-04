<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Portfolio Project Instructions

This is an Nx monorepo with Angular frontend and NestJS backend for a personal portfolio website.

## Project Structure
- **Frontend**: Angular 20 standalone application with animations
- **Backend**: NestJS (ready for future API development)
- **Styling**: Tailwind CSS for utility-first styling
- **Animations**: Angular Animations API with custom Tailwind animations
- **Architecture**: Nx monorepo for scalability

## Key Features
- Responsive design with mobile-first approach using Tailwind CSS
- Animated background with floating particles
- Smooth scroll navigation
- Interactive project showcase
- Skills progression bars
- Contact form integration ready
- Modern gradient design with glassmorphism effects using Tailwind utilities

## Development Guidelines
- Use Angular standalone components
- Implement smooth animations for all interactions using Angular Animations API
- Use Tailwind CSS utilities for all styling - avoid custom CSS where possible
- Follow Tailwind's utility-first approach
- Use TypeScript strict mode
- Implement accessibility features
- Follow modern Angular best practices

## Styling Approach
- **Primary**: Tailwind CSS utilities for all layout, spacing, colors, and effects
- **Custom CSS**: Only for complex animations and keyframes that can't be achieved with Tailwind
- **Colors**: Use the custom primary/secondary color palette defined in tailwind.config.js
- **Components**: Style components using Tailwind classes in templates
- **Responsive**: Use Tailwind's responsive prefixes (sm:, md:, lg:, xl:, 2xl:)

## Animation Patterns
- Use Angular animation triggers for component animations
- Use Tailwind animation utilities where possible (animate-bounce, animate-pulse, etc.)
- Custom keyframes only for complex animations like particle floating
- Apply hover effects using Tailwind hover: utilities
- Use transition utilities for smooth interactions

## Color Scheme
- Primary gradient: Uses custom primary-500 to secondary-500 colors
- Background: Animated gradient using bg-gradient-to-br
- Cards: White with Tailwind shadow utilities
- Text: Tailwind gray scale (text-gray-800, text-gray-600, etc.)

## Tailwind Configuration
- Custom color palette for primary/secondary colors
- Extended animations for float, gradient-shift, typing effects
- Custom keyframes for complex animations
- Background gradients for consistent theming
- Custom shadow utilities for glassmorphism effects
- Text shadow utilities for enhanced typography

## Best Practices
- Avoid inline styles - use Tailwind utilities
- Use ngClass for conditional styling with Tailwind classes
- Leverage Tailwind's spacing scale consistently
- Use semantic color names from the custom palette
- Implement dark mode support using Tailwind's dark: variants when needed
- Use Tailwind's aspect ratio utilities for consistent proportions

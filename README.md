# Portfolio Landing Page

A modern, animated portfolio website built with Angular and NestJS using Nx monorepo.

## 🚀 Features

- **Animated Background**: Beautiful gradient background with floating particles
- **Smooth Animations**: Fade-in, slide-in, and stagger animations using Angular Animations
- **Responsive Design**: Mobile-first approach with Tailwind CSS responsive utilities
- **Modern UI**: Glassmorphism effects, gradient buttons, and smooth transitions using Tailwind
- **Interactive Showroom**: Project showcase with hover effects and overlay actions
- **Skills Section**: Animated progress bars showing skill proficiency
- **Contact Form**: Ready-to-use contact form with Tailwind styling
- **Smooth Scrolling**: Navigation with smooth scroll to sections
- **CI/CD Pipeline**: Automated deployment to DigitalOcean droplet

## 🛠️ Tech Stack

- **Frontend**: Angular 20 (Standalone Components)
- **Backend**: NestJS (ready for future API development)
- **Styling**: Tailwind CSS v4+ with CSS-first configuration
- **Build Tool**: Nx 21.2.2 (Monorepo)
- **Deployment**: DigitalOcean Droplet with Nginx
- **CI/CD**: GitHub Actions

## 🎨 Design Features

- **Color Scheme**: Custom Tailwind color palette (primary/secondary gradients)
- **Typography**: Inter font family configured in Tailwind
- **Effects**: Glassmorphism with backdrop-blur utilities, custom shadows
- **Interactions**: Hover effects with Tailwind utilities and custom animations

## 🚦 Getting Started

### Prerequisites

- Node.js (v20 or higher)
- npm

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npx nx serve portfolio
```

4. Open your browser to `http://localhost:4200`

## 📝 Customization

### Personal Information
Update the `aboutMe` object in `apps/portfolio/src/app/app.ts`:

```typescript
aboutMe = {
  name: 'Your Name',
  title: 'Your Title',
  description: 'Your description...',
  // ... other properties
};
```

### Skills
Modify the `skills` array to reflect your technologies:

```typescript
skills = [
  { name: 'Angular', level: 95, icon: '⚡' },
  // ... add your skills
];
```

### Projects
Update the `projects` array with your portfolio projects:

```typescript
projects = [
  {
    title: 'Project Name',
    description: 'Project description',
    // ... project details
  }
];
```

## 🏗️ Build

To create a production bundle:

```bash
npx nx build portfolio
```

To see all available targets:

```bash
npx nx show project portfolio
```

These targets are either [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Add new projects

While you could add new projects to your workspace manually, you might want to leverage [Nx plugins](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) and their [code generation](https://nx.dev/features/generate-code?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) feature.

Use the plugin's generator to create new projects.

To generate a new application, use:

```sh
npx nx g @nx/angular:app demo
```

To generate a new library, use:

```sh
npx nx g @nx/angular:lib mylib
```

You can use `npx nx list` to get a list of installed plugins. Then, run `npx nx list <plugin-name>` to learn about more specific capabilities of a particular plugin. Alternatively, [install Nx Console](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) to browse plugins and generators in your IDE.

[Learn more about Nx plugins &raquo;](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) | [Browse the plugin registry &raquo;](https://nx.dev/plugin-registry?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)


[Learn more about Nx on CI](https://nx.dev/ci/intro/ci-with-nx#ready-get-started-with-your-provider?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## 🚀 Deployment

This project includes automated CI/CD pipeline for deployment to DigitalOcean droplet.

### Quick Deployment Setup

1. **Create DigitalOcean Droplet**: Ubuntu 22.04 with SSH key access
2. **Run Server Setup**: Execute the setup script on your droplet
3. **Configure GitHub Secrets**: Add droplet credentials to GitHub repository
4. **Deploy**: Push to master branch to trigger automatic deployment

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

### Manual Deployment

```bash
# Build the application
npx nx build portfolio --configuration=production

# Deploy to your server
scp -r dist/apps/portfolio/* user@your-server:/var/www/portfolio/
```

## Useful links

Learn more:

- [Learn more about this workspace setup](https://nx.dev/getting-started/tutorials/angular-monorepo-tutorial?utm_source=nx_project&amp;utm_medium=readme&amp;utm_campaign=nx_projects)
- [Learn about Nx on CI](https://nx.dev/ci/intro/ci-with-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Releasing Packages with Nx release](https://nx.dev/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [What are Nx plugins?](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

And join the Nx community:
- [Discord](https://go.nx.dev/community)
- [Follow us on X](https://twitter.com/nxdevtools) or [LinkedIn](https://www.linkedin.com/company/nrwl)
- [Our Youtube channel](https://www.youtube.com/@nxdevtools)
- [Our blog](https://nx.dev/blog?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

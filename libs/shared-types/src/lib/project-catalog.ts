export interface CatalogProject {id:number;title:string;description:string;technologies:string[];githubUrl:string;liveUrl:string;imageUrl:string;category:'useful'|'play';label:string;showInPortfolio?:boolean;}

export const projectCatalog: CatalogProject[] = [
  {
    id: 1,
    title: 'HLS Player',
    description:
      'A little player for your HLS streams. Pick a quality, hit play, and get pleasantly distracted.',
    technologies: ['Angular', 'HLS.js', 'TypeScript'],
    githubUrl:
      'https://github.com/giorgi0203/portfolio/tree/main/apps/hls-player',
    liveUrl: 'https://hls-player.giorgi.app/',
    imageUrl: '/assets/hls-player.svg',
    category: 'play',
    label: 'VIDEO & DISTRACTIONS',
  },
  {
    id: 2,
    title: 'Smart Todo List',
    description:
      'For when the ideas arrive faster than you can finish them. A task list with an AI sidekick.',
    technologies: ['Next.js', 'React', 'OpenAI'],
    githubUrl: 'https://github.com/giorgi0203/smart-todolist',
    liveUrl: 'https://smart-todolist.giorgi.app/',
    imageUrl: '/assets/smart-todolist.svg',
    category: 'useful',
    label: 'ORGANIZED CHAOS',
  },

  {id:3,title:'Angular Compiler',description:'Compile standalone Angular components into Ivy output. Try examples, edit source, and inspect real compiler diagnostics.',technologies:['Angular', 'TypeScript', 'Monaco'],githubUrl:'https://github.com/giorgi0203/portfolio/tree/codex/portfolio-subdomains/apps/angular-compiler-ui',liveUrl:'https://angular-compiler.giorgi.app/',imageUrl:'/assets/angular-compiler.svg',category:'useful',label:'ANGULAR UNDER THE HOOD'},
  {id:4,showInPortfolio:false,title:'Example MCP',description:'A tiny MCP server with a calculator, date/time tools, resources, and prompt templates. Bring your favorite MCP client.',technologies:['MCP', 'Node.js', 'TypeScript'],githubUrl:'https://github.com/giorgi0203/portfolio/tree/codex/portfolio-subdomains/apps/example-mcp',liveUrl:'https://example-mcp.giorgi.app/',imageUrl:'/assets/example-mcp.svg',category:'useful',label:'TOOLS FOR YOUR TOOLS'},
  {id:5,showInPortfolio:false,title:'MCP Gateway',description:'One entry point for MCP services, with backend discovery and streaming request forwarding.',technologies:['MCP', 'Node.js', 'HTTP'],githubUrl:'https://github.com/giorgi0203/portfolio/tree/codex/portfolio-subdomains/apps/mcp-gateway',liveUrl:'https://mcp.giorgi.app/',imageUrl:'/assets/mcp.svg',category:'useful',label:'ONE DOOR, MANY TOOLS'},
  {id:6,showInPortfolio:false,title:'Portfolio API',description:'Explore the live project catalog and skills through a documented API. No imaginary e-commerce empire included.',technologies:['Express', 'OpenAPI', 'TypeScript'],githubUrl:'https://github.com/giorgi0203/portfolio/tree/codex/portfolio-subdomains/apps/portfolio-api',liveUrl:'https://api.giorgi.app/',imageUrl:'/assets/api.svg',category:'useful',label:'THE WIRING BEHIND IT'},
];

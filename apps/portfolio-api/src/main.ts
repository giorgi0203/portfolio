/** Public, read-only project catalog and API documentation. */
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { projectCatalog, pageviewScript } from 'shared-types';
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'16kb'}));
app.use(cors({origin:['http://localhost:4200','https://giorgi.app','https://www.giorgi.app','https://api.giorgi.app']}));
const spec={openapi:'3.0.3',info:{title:'Giorgi Portfolio API',version:'1.1.0',description:'The real deployed project catalog and personal skills. Contact Giorgi through the form on giorgi.app.'},servers:[{url:process.env.PUBLIC_URL||'/'}],paths:{
 '/api/health':{get:{summary:'Service health',responses:{'200':{description:'Healthy'}}}},
 '/api/projects':{get:{summary:'List deployed apps',responses:{'200':{description:'Current public project catalog'}}}},
 '/api/skills':{get:{summary:'Personal skills',responses:{'200':{description:'Skills and proficiency levels'}}}}
}};
app.get('/',(_req,res)=>res.redirect('/api/docs'));
app.get('/api/health',(_req,res)=>res.json({status:'ok',service:'portfolio-api',timestamp:new Date().toISOString()}));
app.get('/api/projects',(_req,res)=>res.json(projectCatalog));
app.get('/api/docs.json',(_req,res)=>res.json(spec));
app.use('/docs-assets',express.static(process.env.SWAGGER_ASSETS_PATH||path.join(process.cwd(),'node_modules/swagger-ui-dist'),{immutable:true,maxAge:'1d'}));
app.get('/api/docs',(_req,res)=>res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Giorgi Portfolio API</title><link rel="stylesheet" href="/docs-assets/swagger-ui.css"></head><body><nav style="padding:16px;font-family:system-ui"><a href="https://giorgi.app/">← Giorgi’s apps</a> · <a href="https://auth.giorgi.app/">Giorgi account</a></nav><div id="swagger-ui"></div><script src="/docs-assets/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'/api/docs.json',dom_id:'#swagger-ui',deepLinking:true,validatorUrl:null});${pageviewScript}</script></body></html>`));
app.get('/api/skills',(_req,res)=>{
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
// The old demo logged messages and claimed success without sending them.
app.post('/api/contact',(_req,res)=>res.status(410).json({success:false,message:'Please use the contact form at https://giorgi.app/ to send a message.'}));
app.listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log('Portfolio API ready'));

import './style.css';
import { mountEditor } from './editor';
import { mountTable } from './table';

const root = document.querySelector<HTMLElement>('#app')!;
const path = location.pathname.replace(/\/+$/, '');
const match = path.match(/^\/table\/([a-zA-Z0-9_-]{32})$/);
if (match) {
  document.title = 'Your table · Split the Supra';
  mountTable(root, match[1]);
} else if (path) {
  root.innerHTML =
    '<section class="plain-state"><h1>Table not found.</h1><p>Check that the entire invite link was copied.</p><a class="button" href="/">Start a table</a></section>';
} else mountEditor(root);
window.addEventListener('popstate', () => location.reload());

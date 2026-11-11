import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideMonacoEditor } from 'ngx-monaco-editor-v2';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideMonacoEditor({onMonacoLoad:()=>{
      // Package typings are unavailable in Monaco's virtual filesystem; real AOT diagnostics remain available below.
      const monaco=(window as unknown as {monaco:{languages:{typescript:{typescriptDefaults:{setDiagnosticsOptions:(options:{noSemanticValidation:boolean;noSyntaxValidation:boolean})=>void}}}}}).monaco;
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({noSemanticValidation:true,noSyntaxValidation:false});
    }}),
  ],
};

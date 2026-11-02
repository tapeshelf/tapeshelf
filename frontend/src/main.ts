import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { WEB_VERSION } from './app/core/version';

// Which build is open: the API's own commit is in the X-Tapeshelf-Api header of /api responses.
console.info(`tapeshelf web ${WEB_VERSION}`);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

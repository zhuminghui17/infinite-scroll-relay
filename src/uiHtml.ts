import fs from 'fs';
import path from 'path';

export const SESSIONS_UI_HTML = fs.readFileSync(
  path.join(__dirname, 'html', 'sessions-ui.html'),
  'utf8',
);

export const LOGS_UI_HTML = fs.readFileSync(path.join(__dirname, 'html', 'logs-ui.html'), 'utf8');

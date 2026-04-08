import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let serverProcess;
let mainWindow;

function startServer() {
  serverProcess = spawn('node', [path.join(__dirname, '../server/index.js')], {
    env: { ...process.env, PORT: '3001' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', d => console.log(`Server: ${d}`));
  serverProcess.stderr.on('data', d => console.error(`Server error: ${d}`));
}

function waitForServer(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(url, () => resolve()).on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('Server start timeout'));
        setTimeout(check, 200);
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, title: 'ElecDocs',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadURL('http://localhost:3001');
}

app.whenReady().then(async () => {
  startServer();
  await waitForServer('http://localhost:3001');
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-file-dialog', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'Documents', extensions: ['pdf', 'docx'] }]
  });
  return result.filePaths[0] || null;
});

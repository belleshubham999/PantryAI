@echo off
echo Setting up PantryAI frontend...

mkdir frontend
cd frontend

echo Creating package.json...
(
echo {
echo   "name": "pantry-ai-frontend",
echo   "private": true,
echo   "version": "1.0.0",
echo   "type": "module",
echo   "scripts": {
echo     "dev": "vite",
echo     "build": "vite build",
echo     "preview": "vite preview"
echo   },
echo   "dependencies": {
echo     "react": "^18.2.0",
echo     "react-dom": "^18.2.0"
echo   },
echo   "devDependencies": {
echo     "@vitejs/plugin-react": "^4.0.3",
echo     "vite": "^4.4.5"
echo   }
echo }
) > package.json

echo Installing dependencies...
npm install

echo Creating directory structure...
mkdir src
mkdir src/components
mkdir public

echo Setup complete! Now run: cd frontend && npm run build
pause
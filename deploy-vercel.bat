@echo off
echo Installing Vercel CLI...
npm install -g vercel

echo.
echo Login to Vercel...
vercel login

echo.
echo Deploying...
cd /d "%~dp0artifacts\aeci-dashboard"
vercel --yes

echo.
echo Done! Check the URL above.
pause

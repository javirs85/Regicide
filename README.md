# Regicide

Mobile-first React implementation of the Regicide card game, built with Vite.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Vite will print a local URL, usually `http://localhost:5173`.

## Android direction

This project starts as a responsive web app. When the game loop is ready, the clean path to Android is to wrap the Vite build with Capacitor:

```powershell
npm.cmd install @capacitor/core @capacitor/cli @capacitor/android
npx.cmd cap init
npx.cmd cap add android
npm.cmd run build
npx.cmd cap sync android
```

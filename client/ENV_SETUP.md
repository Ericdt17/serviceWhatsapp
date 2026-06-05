# Environment Variables Setup Guide

This guide explains how to configure environment variables for the frontend application.

## Quick Start

1. **Copy the example file:**
   ```bash
   cp .env.example .env.local
   ```

2. **Edit `.env.local` with your configuration:**
   ```bash
   # For development with Vite proxy (recommended)
   VITE_API_BASE_URL=
   
   # OR for direct connection to backend
   VITE_API_BASE_URL=http://localhost:3000
   ```

3. **Restart your development server** if it's already running.

## Environment Files

### `.env.example`
Template file showing all available environment variables. **This file is committed to version control.**

### `.env.local`
Local development overrides. **This file is gitignored** and should not be committed.

### `.env.development.local`
Development-specific overrides (takes precedence over `.env.local`).

### `.env.production.local`
Production-specific overrides (only used in production builds).

## Available Variables

### `VITE_API_BASE_URL`

The base URL for the API server.

**Development:**
- **Empty (recommended)**: Uses Vite proxy configured in `vite.config.ts`
  - Requests to `/api/*` are automatically proxied to `http://localhost:3000`
  - No CORS issues
  - Example: `VITE_API_BASE_URL=`
  
- **Direct connection**: Connect directly to backend
  - Must ensure CORS is properly configured on backend
  - Example: `VITE_API_BASE_URL=http://localhost:3000`

**Production:**
- Set to your production API URL
- Example: `VITE_API_BASE_URL=https://api.yourdomain.com`

## Environment File Priority

Vite loads environment variables in the following order (later files override earlier ones):

1. `.env` - Default values (committed to repo)
2. `.env.local` - Local overrides (gitignored)
3. `.env.[mode]` - Mode-specific (e.g., `.env.development`)
4. `.env.[mode].local` - Mode-specific local overrides

## Usage in Code

Environment variables are accessed via `import.meta.env`:

```typescript
const apiUrl = import.meta.env.VITE_API_BASE_URL;
```

**Note:** Only variables prefixed with `VITE_` are exposed to the client-side code.

## Development Setup

### Option 1: Using Vite Proxy (Recommended)

1. Create `.env.local`:
   ```bash
   VITE_API_BASE_URL=
   ```

2. The Vite proxy (configured in `vite.config.ts`) will handle all `/api/*` requests.

3. Start the development server:
   ```bash
   npm run dev
   ```

### Option 2: Direct Connection

1. Create `.env.local`:
   ```bash
   VITE_API_BASE_URL=http://localhost:3000
   ```

2. Ensure your backend server is running on port 3000 and has CORS enabled.

3. Start the development server:
   ```bash
   npm run dev
   ```

## Production Setup

1. Set environment variables in your deployment platform (Vercel, Netlify, etc.):

   ```bash
   VITE_API_BASE_URL=https://api.yourdomain.com
   ```

2. Or create `.env.production.local`:
   ```bash
   VITE_API_BASE_URL=https://api.yourdomain.com
   ```

3. Build the application:
   ```bash
   npm run build
   ```

## Troubleshooting

### API requests failing in development

1. **Check if backend is running:**
   ```bash
   # Backend should be running on port 3000
   curl http://localhost:3000/api/v1/health
   ```

2. **Check Vite proxy configuration:**
   - Verify `vite.config.ts` has proxy configured for `/api`
   - Check that `VITE_API_BASE_URL` is empty in `.env.local`

3. **Check CORS configuration:**
   - If using direct connection, ensure backend CORS allows `http://localhost:8080`

### Environment variables not working

1. **Restart the dev server** after changing `.env` files
2. **Check variable name** - must start with `VITE_`
3. **Check for typos** in variable names
4. **Verify file location** - `.env` files must be in the project root

### Production build issues

1. **Ensure `VITE_API_BASE_URL` is set** in your deployment platform
2. **Check build logs** for any environment variable warnings
3. **Verify the API URL** is accessible from your production domain

## Security Notes

⚠️ **Important:** Never commit `.env.local` or any file containing sensitive data to version control.

- `.env.local` is already in `.gitignore`
- Only commit `.env.example` as a template
- Use your deployment platform's environment variable settings for production secrets

## Related Files

- `vite.config.ts` - Vite configuration including proxy setup
- `src/lib/api-config.ts` - API configuration that uses these variables
- `.gitignore` - Ensures `.env.local` files are not committed

















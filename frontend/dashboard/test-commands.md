# WizeApp Dashboard Testing Commands

## Start Development Environment
```bash
# Frontend (Dashboard)
cd /Users/hackingcorp/Desktop/WazeApp/dashboard
npm run dev
# Access: http://localhost:3002

# Backend (API) - Optional for full functionality
cd /Users/hackingcorp/Desktop/WazeApp
npm run start:dev
# Access: http://localhost:3100
```

## Build & Production Testing
```bash
# Build for production
npm run build

# Start production server
npm run start

# Type checking
npm run type-check

# Linting
npm run lint
```

## Manual Testing Scenarios

### 1. Dashboard Navigation
- Visit http://localhost:3002
- Should auto-redirect to /dashboard
- Test all sidebar menu items
- Verify responsive design

### 2. Agent Management
- Go to /agents
- Click "Create Agent"
- Fill out all form tabs
- Test file uploads in Knowledge Base
- Submit form and verify creation

### 3. UI Component Testing
- Test drag-and-drop file upload
- Test rich text editor with images
- Test QR scanner (may need to grant camera permissions)
- Toggle between light/dark themes
- Switch languages

### 4. Error Handling
- Try invalid form submissions
- Test network error scenarios
- Verify error boundary functionality

### 5. Performance Testing
- Check initial page load time
- Test chart rendering performance
- Verify smooth animations and transitions

## Browser Testing
Test in multiple browsers:
- Chrome/Chromium
- Firefox
- Safari
- Edge

## Mobile Testing
- Use browser dev tools to simulate mobile devices
- Test touch interactions
- Verify mobile menu functionality
- Check responsive layout on different screen sizes
# Interactive Map Application

A Vue 3 + Vite application for interactive quantum network visualization and simulation.

## Development

### Prerequisites
- Node.js (v18 or higher)
- npm
- Playwright browser dependencies:
  ```bash
  sudo apt-get update
  sudo apt-get install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libxdamage1 libxkbcommon0 libasound2 libcups2 libcairo2 libpango-1.0-0
  ```

### Getting Started
```bash
# Install locked dependencies
npm ci

# Install the Chromium browser used by Playwright
npx playwright install chromium

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The production build is emitted into the backend's `../public/` directory. Those generated
files are ignored by Git; the root `./bin/server` launcher installs dependencies and rebuilds
the GUI automatically before starting the API server.

## Testing

### End-to-End Tests
This project uses Playwright for automated end-to-end testing.

```bash
# Run all e2e tests headlessly in Chromium
npm test

# Equivalent explicit headless command
npm run test:headless

# Run headed in Chromium for local debugging
npm run test:headed

# Run headed on a host without an attached display (requires Xvfb)
xvfb-run -a npm run test:headed
```

The e2e tests automatically start the Vite dev server and run tests in Chromium. They also expect the backend API to be running at `http://localhost:8000`.

### Test Structure
- Tests are located in `tests/e2e/`
- Configuration is in `playwright.config.js`
- Tests verify core functionality like app loading, UI rendering, and user interactions

## Learn More

- [Vue 3 Documentation](https://v3.vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [Playwright Documentation](https://playwright.dev/)

# Interactive Map Application

A Vue 3 + Vite application for interactive quantum network visualization and simulation.

## Development

### Prerequisites
- Node.js (v16 or higher)
- npm

### Getting Started
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Testing

### End-to-End Tests
This project uses Playwright for automated end-to-end testing.

```bash
# Run all e2e tests
npm run test
```

The e2e tests automatically start the Vite dev server and run tests in the browser.

### Test Structure
- Tests are located in `tests/e2e/`
- Configuration is in `playwright.config.js`
- Tests verify core functionality like app loading, UI rendering, and user interactions

## Learn More

- [Vue 3 Documentation](https://v3.vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [Playwright Documentation](https://playwright.dev/)

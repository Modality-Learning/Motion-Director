import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// each test starts with an empty page (testing-library cleans up by itself only with vitest's globals on)
afterEach(() => cleanup());

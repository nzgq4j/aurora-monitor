import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Next's recommended rules (React, hooks, accessibility, Core Web Vitals) and its TypeScript rules.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler readiness rules. The existing screens predate them (about 50 places set state in an
    // effect or read a ref or the clock while rendering, all working as written), so they warn for now and
    // are tightened as those screens are reworked. Everything else is an error in CI.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'public/sw.js', 'scripts/**']),
]);

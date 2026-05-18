// src/declarations.d.ts
//
// Ambient module declarations for non-TypeScript file types.
// TypeScript does not understand CSS/image/svg imports by default.
// This file tells the compiler to treat them as valid modules
// so `import './SfRecordForm.css'` stops throwing:
//   "Cannot find module or type declarations for side-effect import"

// ── CSS files ──────────────────────────────────────────────────────────────────
// Side-effect imports:  import './Component.css'
// Named imports (CSS Modules): import styles from './Component.module.css'
declare module '*.css' {
  const styles: { [className: string]: string };
  export default styles;
}

// ── CSS Modules (explicit, for projects using .module.css convention) ─────────
declare module '*.module.css' {
  const styles: { [className: string]: string };
  export default styles;
}

// ── SCSS / SASS ────────────────────────────────────────────────────────────────
declare module '*.scss' {
  const styles: { [className: string]: string };
  export default styles;
}

declare module '*.module.scss' {
  const styles: { [className: string]: string };
  export default styles;
}

// ── SVG ────────────────────────────────────────────────────────────────────────
declare module '*.svg' {
  import type { FunctionComponent, SVGProps } from 'react';
  export const ReactComponent: FunctionComponent<
    SVGProps<SVGSVGElement> & { title?: string }
  >;
  const src: string;
  export default src;
}

// ── Images ────────────────────────────────────────────────────────────────────
declare module '*.png' { const src: string; export default src; }
declare module '*.jpg' { const src: string; export default src; }
declare module '*.jpeg' { const src: string; export default src; }
declare module '*.webp' { const src: string; export default src; }
declare module '*.gif'  { const src: string; export default src; }

// ── Fonts ─────────────────────────────────────────────────────────────────────
declare module '*.woff'  { const src: string; export default src; }
declare module '*.woff2' { const src: string; export default src; }
declare module '*.ttf'   { const src: string; export default src; }
declare module '*.eot'   { const src: string; export default src; }

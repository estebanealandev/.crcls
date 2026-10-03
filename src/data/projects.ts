// Locale-independent metadata for every project: the home/work index lists and
// the case-study pages under /project/<slug>.
// All case-study pages share one layout (identical dataWfPage, node ids, and
// structure — verified structurally near-100% identical), so they render
// through a single Astro template (ProjectPage.astro) and only this data plus
// the per-locale namespace in src/i18n/locales/projects/<slug>/ differ
// between them.

export interface ProjectImage {
  src: string;
  srcset: string;
  sizes: string;
}

export interface ProjectData {
  slug: string;
  dataWfPage: string;
  wfScript: string;
  heroImage: ProjectImage;
  /** Circular logo mark shown on this project's card in other pages' "Related Work" grids. */
  logoImage: string | null;
  /** Looping background video shown on this project's card in other pages' "Related Work" grids, if any. */
  video: string | null;
  galleryImages: ProjectImage[];
  /** The project's official, live website. Index rows link here; rows without one render unlinked. */
  siteUrl: string | null;
  year: number;
}

/**
 * Case-study pages (/project/<slug> in every locale) are switched off: no route
 * is built, nothing links to them, the sitemap skips them, and firebase.json
 * 301s the old URLs to /work. Flipping this back on (and removing those
 * redirects) restores them; templates, copy and assets are kept intact.
 */
export const PROJECT_PAGES_ENABLED = false;

export const PROJECTS: ProjectData[] = [
  {
    slug: 'dentika',
    dataWfPage: '69ea3b293f46d55a8da1996c',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    // Capture of the live site's home hero (dentikacr.com, 1440x810 @2x).
    heroImage: {
      src: '/assets/images/dentika/dentika-site-hero-1600.webp',
      sizes: '100vw',
      srcset:
        '/assets/images/dentika/dentika-site-hero-500.webp 500w, /assets/images/dentika/dentika-site-hero-800.webp 800w, /assets/images/dentika/dentika-site-hero-1080.webp 1080w, /assets/images/dentika/dentika-site-hero-1600.webp 1600w',
    },
    logoImage: '/assets/images/dentika/dentika-hero-500.webp',
    video: null,
    galleryImages: [
      {
        src: '/assets/images/dentika/source-site-desktop.webp',
        sizes: '(max-width: 767px) 100vw, 80vw',
        srcset: '/assets/images/dentika/source-site-desktop.webp 1600w',
      },
      {
        src: '/assets/images/dentika/source-site-mobile.webp',
        sizes: '(max-width: 767px) 80vw, 30vw',
        srcset: '/assets/images/dentika/source-site-mobile.webp 393w',
      },
    ],
    siteUrl: 'https://dentikacr.com',
    year: 2026,
  },
  {
    slug: 'cafco',
    dataWfPage: '69ea3b293f46d55a8da1996c',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    // Capture of the live site's home hero (cafcocr.com, 1440x810 @2x).
    heroImage: {
      src: '/assets/images/cafco/cafco-site-hero-1600.webp',
      sizes: '100vw',
      srcset:
        '/assets/images/cafco/cafco-site-hero-500.webp 500w, /assets/images/cafco/cafco-site-hero-800.webp 800w, /assets/images/cafco/cafco-site-hero-1080.webp 1080w, /assets/images/cafco/cafco-site-hero-1600.webp 1600w',
    },
    logoImage: null,
    video: null,
    galleryImages: [],
    siteUrl: 'https://cafcocr.com',
    year: 2026,
  },
  {
    slug: 'lawyi',
    dataWfPage: '69ea3b293f46d55a8da1996c',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    // Capture of the live site's home hero (lawyi.app, 1440x810 @2x).
    heroImage: {
      src: '/assets/images/lawyi/lawyi-site-hero-1600.webp',
      sizes: '100vw',
      srcset:
        '/assets/images/lawyi/lawyi-site-hero-500.webp 500w, /assets/images/lawyi/lawyi-site-hero-800.webp 800w, /assets/images/lawyi/lawyi-site-hero-1080.webp 1080w, /assets/images/lawyi/lawyi-site-hero-1600.webp 1600w',
    },
    logoImage: null,
    video: null,
    galleryImages: [],
    siteUrl: 'https://lawyi.app',
    year: 2026,
  },
  {
    slug: 'las-musas',
    dataWfPage: '69ea3b293f46d55a8da1996c',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    // Capture of the live site's home hero (lasmusascr.com, 1440x810 @2x).
    heroImage: {
      src: '/assets/images/las-musas/las-musas-site-hero-1600.webp',
      sizes: '100vw',
      srcset:
        '/assets/images/las-musas/las-musas-site-hero-500.webp 500w, /assets/images/las-musas/las-musas-site-hero-800.webp 800w, /assets/images/las-musas/las-musas-site-hero-1080.webp 1080w, /assets/images/las-musas/las-musas-site-hero-1600.webp 1600w',
    },
    logoImage: null,
    video: null,
    galleryImages: [],
    siteUrl: 'https://lasmusascr.com',
    year: 2026,
  },
  {
    slug: 'vertex',
    dataWfPage: '69ea3b293f46d55a8da1996c',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    heroImage: {
      src: '/assets/images/work-1.webp',
      sizes: '100vw',
      srcset:
        '/assets/images/work-1-p-500.webp 500w, /assets/images/work-1-p-800.webp 800w, /assets/images/work-1-p-1080.webp 1080w, /assets/images/work-1-p-1600.webp 1600w, /assets/images/work-1-p-2000.webp 2000w, /assets/images/work-1.webp 2400w',
    },
    logoImage: '/assets/images/logo-8.webp',
    video: null,
    galleryImages: [
      {
        src: '/assets/images/project-vertex-01.webp',
        sizes: '100vw',
        srcset:
          '/assets/images/project-vertex-01-p-500.webp 500w, /assets/images/project-vertex-01-p-800.webp 800w, /assets/images/project-vertex-01-p-1080.webp 1080w, /assets/images/project-vertex-01.webp 1254w',
      },
      {
        src: '/assets/images/project-vertex-02.webp',
        sizes: '100vw',
        srcset:
          '/assets/images/project-vertex-02-p-500.webp 500w, /assets/images/project-vertex-02-p-800.webp 800w, /assets/images/project-vertex-02-p-1080.webp 1080w, /assets/images/project-vertex-02.webp 1254w',
      },
    ],
    siteUrl: null,
    year: 2026,
  },
  {
    slug: 'pulse',
    dataWfPage: '69ea3b293f46d55a8da1996c',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    heroImage: {
      src: '/assets/images/work-3.webp',
      sizes: '100vw',
      srcset:
        '/assets/images/work-3-p-500.webp 500w, /assets/images/work-3-p-800.webp 800w, /assets/images/work-3-p-1080.webp 1080w, /assets/images/work-3-p-1600.webp 1600w, /assets/images/work-3-p-2000.webp 2000w, /assets/images/work-3.webp 2400w',
    },
    logoImage: null,
    video: null,
    galleryImages: [
      {
        src: '/assets/images/project-pulse-01.webp',
        sizes: '100vw',
        srcset:
          '/assets/images/project-pulse-01-p-500.webp 500w, /assets/images/project-pulse-01-p-800.webp 800w, /assets/images/project-pulse-01-p-1080.webp 1080w, /assets/images/project-pulse-01.webp 1254w',
      },
      {
        src: '/assets/images/project-pulse-02.webp',
        sizes: '100vw',
        srcset:
          '/assets/images/project-pulse-02-p-500.webp 500w, /assets/images/project-pulse-02-p-800.webp 800w, /assets/images/project-pulse-02-p-1080.webp 1080w, /assets/images/project-pulse-02.webp 1402w',
      },
    ],
    siteUrl: null,
    year: 2026,
  },
];

export function getProject(slug: string): ProjectData | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

/** getProject() for slugs that are guaranteed to exist (build fails loudly otherwise). */
export function requireProject(slug: string): ProjectData {
  const project = getProject(slug);
  if (!project) throw new Error(`Unknown project slug: ${slug}`);
  return project;
}

export function otherProjects(slug: string): ProjectData[] {
  return PROJECTS.filter((p) => p.slug !== slug);
}

/** Projects that get a /project/<slug> page; empty while PROJECT_PAGES_ENABLED is off. */
export const PROJECT_PAGES: ProjectData[] = PROJECT_PAGES_ENABLED ? PROJECTS : [];

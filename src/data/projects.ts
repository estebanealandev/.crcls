// Locale-independent metadata for every project: the home/work index lists and
// the case-study pages under /project/<slug>.
// All five pages share one layout (identical dataWfPage, node ids, and
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
    heroImage: {
      src: '/assets/images/dentika/dentika-hero-1600.webp',
      sizes: '100vw',
      srcset:
        '/assets/images/dentika/dentika-hero-500.webp 500w, /assets/images/dentika/dentika-hero-800.webp 800w, /assets/images/dentika/dentika-hero-1080.webp 1080w, /assets/images/dentika/dentika-hero-1600.webp 1600w',
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
    slug: 'aether',
    dataWfPage: '69ea3b293f46d55a8da1996c',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    heroImage: {
      src: '/assets/images/pexels-cottonbro-10678368.webp',
      sizes: '100vw',
      srcset:
        '/assets/images/pexels-cottonbro-10678368-p-500.webp 500w, /assets/images/pexels-cottonbro-10678368-p-800.webp 800w, /assets/images/pexels-cottonbro-10678368-p-1080.webp 1080w, /assets/images/pexels-cottonbro-10678368-p-1600.webp 1600w, /assets/images/pexels-cottonbro-10678368-p-2000.webp 2000w, /assets/images/pexels-cottonbro-10678368-p-2600.webp 2600w, /assets/images/pexels-cottonbro-10678368-p-3200.webp 3200w, /assets/images/pexels-cottonbro-10678368.webp 4000w',
    },
    logoImage: null,
    video: 'https://videos.pexels.com/video-files/10678346/10678346-uhd_1440_2732_25fps.mp4',
    galleryImages: [
      {
        src: '/assets/images/pexels-cottonbro-10678366.webp',
        sizes: '100vw',
        srcset:
          '/assets/images/pexels-cottonbro-10678366-p-500.webp 500w, /assets/images/pexels-cottonbro-10678366-p-800.webp 800w, /assets/images/pexels-cottonbro-10678366-p-1080.webp 1080w, /assets/images/pexels-cottonbro-10678366-p-1600.webp 1600w, /assets/images/pexels-cottonbro-10678366-p-2000.webp 2000w, /assets/images/pexels-cottonbro-10678366-p-2600.webp 2600w, /assets/images/pexels-cottonbro-10678366-p-3200.webp 3200w, /assets/images/pexels-cottonbro-10678366.webp 4000w',
      },
      {
        src: '/assets/images/pexels-cottonbro-10678363.webp',
        sizes: '100vw',
        srcset:
          '/assets/images/pexels-cottonbro-10678363-p-500.webp 500w, /assets/images/pexels-cottonbro-10678363-p-800.webp 800w, /assets/images/pexels-cottonbro-10678363-p-1080.webp 1080w, /assets/images/pexels-cottonbro-10678363-p-1600.webp 1600w, /assets/images/pexels-cottonbro-10678363-p-2000.webp 2000w, /assets/images/pexels-cottonbro-10678363-p-2600.webp 2600w, /assets/images/pexels-cottonbro-10678363-p-3200.webp 3200w, /assets/images/pexels-cottonbro-10678363.webp 4000w',
      },
    ],
    siteUrl: null,
    year: 2026,
  },
  {
    slug: 'nova',
    dataWfPage: '69ea3b293f46d55a8da1996c',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    heroImage: {
      src: '/assets/images/Vintage-Lace-Portrait-alt.webp',
      sizes: '100vw',
      srcset:
        '/assets/images/Vintage-Lace-Portrait-alt-p-500.webp 500w, /assets/images/Vintage-Lace-Portrait-alt-p-800.webp 800w, /assets/images/Vintage-Lace-Portrait-alt-p-1080.webp 1080w, /assets/images/Vintage-Lace-Portrait-alt-p-1600.webp 1600w, /assets/images/Vintage-Lace-Portrait-alt-p-2000.webp 2000w, /assets/images/Vintage-Lace-Portrait-alt-p-2600.webp 2600w, /assets/images/Vintage-Lace-Portrait-alt-p-3200.webp 3200w, /assets/images/Vintage-Lace-Portrait-alt.webp 4800w',
    },
    logoImage: '/assets/images/logo-5.webp',
    video: null,
    galleryImages: [
      {
        src: '/assets/images/project-nova-01.webp',
        sizes: '100vw',
        srcset:
          '/assets/images/project-nova-01-p-500.webp 500w, /assets/images/project-nova-01-p-800.webp 800w, /assets/images/project-nova-01-p-1080.webp 1080w, /assets/images/project-nova-01.webp 1536w',
      },
      {
        src: '/assets/images/project-nova-02.webp',
        sizes: '100vw',
        srcset:
          '/assets/images/project-nova-02-p-500.webp 500w, /assets/images/project-nova-02-p-800.webp 800w, /assets/images/project-nova-02-p-1080.webp 1080w, /assets/images/project-nova-02.webp 1536w',
      },
    ],
    siteUrl: null,
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

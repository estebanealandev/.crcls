// Locale-independent metadata for the journal articles under /post/<slug>.
// All four pages share one layout (identical dataWfPage), so they render
// through a single Astro template (PostPage.astro). One post
// ("how-great-design-drives-perception-and-growth") carries its own distinct
// set of interaction-runtime anchor ids — preserved here rather than unified,
// to avoid guessing whether any bound animation depends on them.

export interface PostIds {
  blurEffect: string;
  heroSlider: string;
  midAnchor1: string;
  midAnchor2: string;
  relatedListWNode: string;
  /** IX2 anchor ids for each of the 3 related-post cards, in display order. */
  relatedImageWrapIds: [string, string, string];
}

export interface PostData {
  slug: string;
  dataWfPage: string;
  wfScript: string;
  /** Basename shared by the hero background image and its responsive gallery variant, e.g. "blog-4" -> /assets/images/blog-4.webp */
  heroImageBase: string;
  ids: PostIds;
}

const SHARED_IDS: PostIds = {
  blurEffect: 'd9e6ffba-48cf-87f2-0856-4f92377759f4',
  heroSlider: 'b78e03dc-547a-2f05-93ff-d8c2bac50f34',
  midAnchor1: 'b78e03dc-547a-2f05-93ff-d8c2bac50f3f',
  midAnchor2: 'f8a1c845-9381-1617-6ae9-7324b9617738',
  relatedListWNode: '5eb05786-7786-89d0-f848-011f7fd90569',
  relatedImageWrapIds: [
    '5eb05786-7786-89d0-f848-011f7fd90571',
    '5eb05786-7786-89d0-f848-011f7fd90571',
    '5eb05786-7786-89d0-f848-011f7fd90571',
  ],
};

export const POSTS: PostData[] = [
  {
    slug: 'designing-digital-systems-that-scale-with-intention',
    dataWfPage: '69ea3b293f46d55a8da19973',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    heroImageBase: 'blog-4',
    ids: SHARED_IDS,
  },
  {
    slug: 'from-idea-to-execution-building-with-precision',
    dataWfPage: '69ea3b293f46d55a8da19973',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    heroImageBase: 'blog-2',
    ids: SHARED_IDS,
  },
  {
    slug: 'how-great-design-drives-perception-and-growth',
    dataWfPage: '69ea3b293f46d55a8da19973',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    heroImageBase: 'blog-1',
    ids: {
      blurEffect: 'd9e6ffba-48cf-87f2-0856-4f92377759f5',
      heroSlider: 'b78e03dc-547a-2f05-93ff-d8c2bac50f35',
      midAnchor1: 'b78e03dc-547a-2f05-93ff-d8c2bac50f40',
      midAnchor2: 'f8a1c845-9381-1617-6ae9-7324b961773a',
      relatedListWNode: '5eb05786-7786-89d0-f848-011f7fd90570',
      relatedImageWrapIds: [
        '5eb05786-7786-89d0-f848-011f7fd90572',
        '5eb05786-7786-89d0-f848-011f7fd90573',
        '5eb05786-7786-89d0-f848-011f7fd90574',
      ],
    },
  },
  {
    slug: 'why-clarity-is-the-foundation-of-modern-brands',
    dataWfPage: '69ea3b293f46d55a8da19973',
    wfScript: '/js/webflow.e6aeb930.103a96742c08bc67.js',
    heroImageBase: 'blog-3',
    ids: SHARED_IDS,
  },
];

export function getPost(slug: string): PostData | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/** getPost() for slugs that are guaranteed to exist (build fails loudly otherwise). */
export function requirePost(slug: string): PostData {
  const post = getPost(slug);
  if (!post) throw new Error(`Unknown post slug: ${slug}`);
  return post;
}

export function otherPosts(slug: string): PostData[] {
  return POSTS.filter((p) => p.slug !== slug);
}

export function postImageSrcset(base: string): { src: string; sizes: string; srcset: string } {
  const src = `/assets/images/${base}.webp`;
  return {
    src,
    sizes: '100vw',
    srcset: [500, 800, 1080, 1600, 2000]
      .map((w) => `/assets/images/${base}-p-${w}.webp ${w}w`)
      .concat(`${src} 2400w`)
      .join(', '),
  };
}

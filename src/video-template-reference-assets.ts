const base = `${import.meta.env.BASE_URL}assets/video-template-20261023/`;

// Original Figma assets: template 76:5477, hover panels 141:24346 / 141:24242.
export const videoTemplateReferenceAssets = {
  subjectThumbnail: `${base}subject-thumbnail.png`,
  modelThumbnail: `${base}model-thumbnail.png`,
  subjectFront: `${base}subject-front.jpg`,
  subjectBack: `${base}subject-back.png`,
  subjectPrevious: `${base}subject-previous.svg`,
  subjectNext: `${base}subject-next.svg`,
  // Figma 171:30376, Beta Tonal XS chevron-right, native 16px icon.
  thumbnailNext: `${base}thumbnail-next.svg`,
  modelPreview: `${base}model-preview.png`,
  brandSubject: `${base}brand-subject.png`,
  brandModel: `${base}brand-model.png`,
};

export const videoTemplateSubjectImages = [
  videoTemplateReferenceAssets.subjectFront,
  videoTemplateReferenceAssets.subjectBack,
];

export type VideoTemplateReferenceSet = {
  subjects: readonly string[];
  subjectThumbnail: string;
  modelThumbnail: string;
  modelPreview: string;
};

export const videoTemplateReferenceSets = {
  commerce: {
    subjects: videoTemplateSubjectImages,
    subjectThumbnail: videoTemplateReferenceAssets.subjectThumbnail,
    modelThumbnail: videoTemplateReferenceAssets.modelThumbnail,
    modelPreview: videoTemplateReferenceAssets.modelPreview,
  },
  brand: {
    // Eight total references, including the model, for the requested scrolling demo.
    subjects: [
      videoTemplateReferenceAssets.brandSubject,
      videoTemplateReferenceAssets.subjectFront,
      videoTemplateReferenceAssets.subjectBack,
      `${import.meta.env.BASE_URL}assets/try-on/history/regular-1.png`,
      `${import.meta.env.BASE_URL}assets/try-on/history/regular-2.png`,
      `${import.meta.env.BASE_URL}assets/try-on/history/regular-3.png`,
      `${import.meta.env.BASE_URL}assets/try-on/history/regular-4.png`,
    ],
    subjectThumbnail: videoTemplateReferenceAssets.brandSubject,
    modelThumbnail: videoTemplateReferenceAssets.brandModel,
    modelPreview: videoTemplateReferenceAssets.brandModel,
  },
} satisfies Record<string, VideoTemplateReferenceSet>;

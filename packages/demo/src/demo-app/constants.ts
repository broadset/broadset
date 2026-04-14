import { DEFAULT_ELEMENT_TYPES } from '@broadset/ui';

import type { MediaAsset, TemplateEntry } from '../../../ui/src/modals/types';

export const ELEMENT_TOOL_TYPES = [
  ...DEFAULT_ELEMENT_TYPES,
  { type: 'countdown', label: 'Countdown', icon: '⏱' },
] as const;

export const ENABLED_EXPORTERS: readonly string[] = [
  'html',
  'svg',
  'pdf',
  'psd',
  'pptx',
  'png',
  'jpeg',
  'svg-embedded',
  'ograf',
  'webm',
] as const;

export const DEMO_MEDIA_ASSETS: readonly MediaAsset[] = [
  { id: 'placeholder-1', name: 'Placeholder 800×600', url: 'https://placehold.co/800x600', category: 'Backgrounds' },
  {
    id: 'placeholder-2',
    name: 'Placeholder 1920×1080',
    url: 'https://placehold.co/1920x1080',
    category: 'Backgrounds',
  },
  { id: 'placeholder-3', name: 'Logo Placeholder', url: 'https://placehold.co/200x200', category: 'Logos' },
  { id: 'placeholder-4', name: 'Icon Placeholder', url: 'https://placehold.co/100x100', category: 'Icons' },
] as const;

export const MEDIA_CATEGORIES: readonly string[] = ['All', 'Backgrounds', 'Logos', 'Icons'] as const;

export const DEMO_TEMPLATES: readonly TemplateEntry[] = [
  {
    id: 'tpl-score',
    name: 'Sports Score',
    thumbnail: 'https://placehold.co/320x180?text=Score',
    category: 'Lower Thirds',
  },
  {
    id: 'tpl-news',
    name: 'News Ticker',
    thumbnail: 'https://placehold.co/320x180?text=News',
    category: 'Lower Thirds',
  },
  {
    id: 'tpl-fullscreen',
    name: 'Full Screen Graphic',
    thumbnail: 'https://placehold.co/320x180?text=Full',
    category: 'Full Screen',
  },
  {
    id: 'tpl-weather',
    name: 'Weather Overlay',
    thumbnail: 'https://placehold.co/320x180?text=Weather',
    category: 'Full Screen',
  },
] as const;

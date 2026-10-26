import { createContext, useContext, type ReactNode } from 'react';
import type { LibraryImage } from './asset-library';
import type { Locale } from './i18n';
import { useSavedPrompts } from './useSavedPrompts';

type PromptLibraryAssets = {
  uploads: LibraryImage[];
  onUpload: (image: LibraryImage) => void;
  locale: Locale;
};
const PromptLibraryContext = createContext<(PromptLibraryAssets & ReturnType<typeof useSavedPrompts>) | null>(null);

export function PromptLibraryProvider({ children, ...assets }: PromptLibraryAssets & { children: ReactNode }) {
  const library = useSavedPrompts();
  return <PromptLibraryContext.Provider value={{ ...assets, ...library }}>{children}</PromptLibraryContext.Provider>;
}

export function usePromptLibrary() {
  const library = useContext(PromptLibraryContext);
  if (!library) throw new Error('PromptTools requires PromptLibraryProvider');
  return library;
}

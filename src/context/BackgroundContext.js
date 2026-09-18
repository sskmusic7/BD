import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import config from '../config/config';

const BackgroundContext = createContext();

export const useBackground = () => {
  const context = useContext(BackgroundContext);
  if (!context) {
    throw new Error('useBackground must be used within a BackgroundProvider');
  }
  return context;
};

// Backgrounds are curated offline (scripts/curate-backgrounds.js) and served
// by the backend, rather than bundled with the client. The old built-in list
// shipped 173MB of GIFs and video in the app itself — including an 80MB GIF
// that the picker loaded as a *thumbnail* every time it was opened.
const STORAGE_KEY = 'bodydouble_background_id';
const LEGACY_STORAGE_KEY = 'bodydouble_background_index';

// Bundled with the client so there's always something to render: during the
// moment before the manifest arrives, and if the backend is unreachable.
const FALLBACK = {
  id: 'lavender-gradient',
  name: 'Lavender Gradient',
  vibe: 'abstract',
  url: '/backgrounds/lavender-gradient.jpg',
  thumbUrl: '/backgrounds/lavender-gradient.jpg',
};

// Older builds stored an array position, which is exactly why this now stores
// an id — positions silently point at a different image as soon as the list
// changes. Only two of the originals survived the cull, so map those and let
// anything else fall back to the default rather than pick something unrelated.
const LEGACY_INDEX_TO_ID = { 9: 'bokeh-foliage', 10: 'lavender-gradient' };

function loadSavedId() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return saved;

  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy !== null) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    const migrated = LEGACY_INDEX_TO_ID[parseInt(legacy, 10)];
    if (migrated) {
      localStorage.setItem(STORAGE_KEY, migrated);
      return migrated;
    }
  }
  return FALLBACK.id;
}

export const BackgroundProvider = ({ children }) => {
  const [backgrounds, setBackgrounds] = useState([FALLBACK]);
  const [selectedId, setSelectedId] = useState(loadSavedId);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, selectedId);
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;

    fetch(`${config.SERVER_URL}/api/backgrounds`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data?.backgrounds?.length) return;
        // The manifest returns server-relative paths; make them absolute so
        // they resolve against the backend rather than the Vercel origin.
        setBackgrounds(data.backgrounds.map(b => ({
          ...b,
          url: `${config.SERVER_URL}${b.url}`,
          thumbUrl: `${config.SERVER_URL}${b.thumbUrl}`,
        })));
      })
      .catch(err => {
        console.error('Could not load background gallery, using fallback:', err.message);
      });

    return () => { cancelled = true; };
  }, []);

  // Derived rather than stored, so a saved id that no longer exists (an image
  // retired by a later curation run) quietly resolves to the first one.
  const currentIndex = useMemo(() => {
    const found = backgrounds.findIndex(b => b.id === selectedId);
    return found === -1 ? 0 : found;
  }, [backgrounds, selectedId]);

  const currentBackground = backgrounds[currentIndex] || FALLBACK;

  const setBackground = useCallback((index) => {
    setBackgrounds(current => {
      if (index >= 0 && index < current.length) setSelectedId(current[index].id);
      return current;
    });
  }, []);

  const nextBackground = useCallback(() => {
    setBackgrounds(current => {
      const at = current.findIndex(b => b.id === selectedId);
      setSelectedId(current[((at === -1 ? 0 : at) + 1) % current.length].id);
      return current;
    });
  }, [selectedId]);

  const previousBackground = useCallback(() => {
    setBackgrounds(current => {
      const at = current.findIndex(b => b.id === selectedId);
      const base = at === -1 ? 0 : at;
      setSelectedId(current[(base - 1 + current.length) % current.length].id);
      return current;
    });
  }, [selectedId]);

  const value = useMemo(() => ({
    backgrounds,
    currentIndex,
    // Consumers use this directly in a CSS url(), so it stays a plain string.
    currentBackground: currentBackground.url,
    currentBackgroundObject: currentBackground,
    currentBackgroundName: currentBackground.name,
    nextBackground,
    previousBackground,
    setBackground,
  }), [backgrounds, currentIndex, currentBackground, nextBackground, previousBackground, setBackground]);

  return (
    <BackgroundContext.Provider value={value}>
      {children}
    </BackgroundContext.Provider>
  );
};

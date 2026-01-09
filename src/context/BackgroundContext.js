import React, { createContext, useContext, useState, useEffect } from 'react';

const BackgroundContext = createContext();

export const useBackground = () => {
  const context = useContext(BackgroundContext);
  if (!context) {
    throw new Error('useBackground must be used within a BackgroundProvider');
  }
  return context;
};

// Available backgrounds
const BACKGROUNDS = [
  {
    name: 'Water Loop',
    path: '/backgrounds/Make_the_water_clearer_looping.gif',
    type: 'gif'
  },
  {
    name: 'Water Animation',
    path: '/backgrounds/Make_the_water_202508281426gif.gif',
    type: 'gif'
  },
  {
    name: 'Serene Sky Drift',
    path: '/backgrounds/20250819_1721_Serene Sky Drift_simple_compose_01k31j5vpwfxdrw2cznmr6nhcp.gif',
    type: 'gif'
  },
  {
    name: 'Cozy Cabin Serenity',
    path: '/backgrounds/20250819_1737_Cozy Cabin Serenity_simple_compose_01k31k3d0vf73s5nexf1yrq09a.gif',
    type: 'gif'
  },
  {
    name: 'Dreamy Clouds',
    path: '/backgrounds/dreamy-clouds.jpg',
    type: 'image'
  },
  {
    name: 'Forest Cabin',
    path: '/backgrounds/forest-cabin.jpg',
    type: 'image'
  },
  {
    name: 'Mountain Landscape',
    path: '/backgrounds/mountain-landscape.jpg',
    type: 'image'
  },
  {
    name: 'Bokeh Foliage',
    path: '/backgrounds/bokeh-foliage.jpg',
    type: 'image'
  },
  {
    name: 'Lavender Gradient',
    path: '/backgrounds/lavender-gradient.jpg',
    type: 'image'
  }
];

const STORAGE_KEY = 'bodydouble_background_index';

export const BackgroundProvider = ({ children }) => {
  // Load saved background index from localStorage, default to 0
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null ? parseInt(saved, 10) : 0;
  });

  // Save to localStorage whenever index changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, currentIndex.toString());
  }, [currentIndex]);

  const currentBackground = BACKGROUNDS[currentIndex];

  const nextBackground = () => {
    setCurrentIndex((prev) => (prev + 1) % BACKGROUNDS.length);
  };

  const previousBackground = () => {
    setCurrentIndex((prev) => (prev - 1 + BACKGROUNDS.length) % BACKGROUNDS.length);
  };

  const setBackground = (index) => {
    if (index >= 0 && index < BACKGROUNDS.length) {
      setCurrentIndex(index);
    }
  };

  const value = {
    backgrounds: BACKGROUNDS,
    currentIndex,
    currentBackground: currentBackground.path,
    currentBackgroundName: currentBackground.name,
    nextBackground,
    previousBackground,
    setBackground
  };

  return (
    <BackgroundContext.Provider value={value}>
      {children}
    </BackgroundContext.Provider>
  );
};


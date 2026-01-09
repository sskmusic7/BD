import React, { useState } from 'react';
import { Palette, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useBackground } from '../context/BackgroundContext';

const BackgroundSelector = () => {
  const { backgrounds, currentIndex, currentBackgroundName, nextBackground, previousBackground, setBackground } = useBackground();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110"
        aria-label="Change background"
      >
        <Palette className="w-6 h-6 text-white" />
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-gray-200 p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">Select Background</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Current Background Display */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Current Background</p>
                  <p className="text-lg font-semibold text-gray-800">{currentBackgroundName}</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={previousBackground}
                    className="bg-gray-100 hover:bg-gray-200 rounded-lg p-2 transition-colors"
                    aria-label="Previous background"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-700" />
                  </button>
                  <button
                    onClick={nextBackground}
                    className="bg-gray-100 hover:bg-gray-200 rounded-lg p-2 transition-colors"
                    aria-label="Next background"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-700" />
                  </button>
                </div>
              </div>
              <div className="relative w-full h-32 rounded-lg overflow-hidden border-2 border-blue-500">
                <img
                  src={backgrounds[currentIndex].path}
                  alt={currentBackgroundName}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Background Grid */}
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">All Backgrounds</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {backgrounds.map((bg, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setBackground(index);
                      setIsOpen(false);
                    }}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                      index === currentIndex
                        ? 'border-blue-500 ring-2 ring-blue-300'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={bg.path}
                      alt={bg.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors" />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-white text-xs font-medium truncate">{bg.name}</p>
                    </div>
                    {index === currentIndex && (
                      <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BackgroundSelector;


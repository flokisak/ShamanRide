import React, { useState, useEffect } from 'react';
import { CloseIcon } from './icons';
import { searchPOIs, POIResult, POI_CATEGORIES, searchHotels, searchRestaurants, searchWineries } from '../services/poiService';
import { useTranslation } from '../contexts/LanguageContext';

interface POISearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPOI: (poi: POIResult) => void;
  userLocation?: { lat: number; lng: number };
  searchRadius?: number;
}

type SearchCategory = 'all' | 'hotels' | 'restaurants' | 'wineries' | 'custom';

export const POISearchModal: React.FC<POISearchModalProps> = ({
  isOpen,
  onClose,
  onSelectPOI,
  userLocation,
  searchRadius = 10000
}) => {
  const { t, language } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory>('all');
  const [searchResults, setSearchResults] = useState<POIResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = [
    { key: 'all', label: 'Všechny', icon: '🔍' },
    { key: 'hotels', label: 'Hotely', icon: '🏨' },
    { key: 'restaurants', label: 'Restaurace', icon: '🍽️' },
    { key: 'wineries', label: 'Vinařství', icon: '🍷' }
  ];

  useEffect(() => {
    if (isOpen) {
      performSearch();
    }
  }, [isOpen, searchQuery, selectedCategory, userLocation]);

  const performSearch = async () => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);

    try {
      let results: POIResult[] = [];

      if (searchQuery.trim().length >= 2) {
        // Text search
        results = await searchPOIs({
          query: searchQuery,
          location: userLocation,
          radius: searchRadius,
          language
        });
      } else if (selectedCategory !== 'all') {
        // Category search
        switch (selectedCategory) {
          case 'hotels':
            results = await searchHotels(userLocation, searchRadius, language);
            break;
          case 'restaurants':
            results = await searchRestaurants(userLocation, searchRadius, language);
            break;
          case 'wineries':
            results = await searchWineries(userLocation, searchRadius, language);
            break;
          default:
            results = await searchPOIs({
              location: userLocation,
              radius: searchRadius,
              language
            });
        }
      } else {
        // General search without query
        results = await searchPOIs({
          location: userLocation,
          radius: searchRadius,
          language
        });
      }

      setSearchResults(results);
    } catch (err: any) {
      console.error('POI search error:', err);
      setError('Chyba při vyhledávání míst');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePOISelect = (poi: POIResult) => {
    onSelectPOI(poi);
    onClose();
  };

  const formatDistance = (distance: number) => {
    if (distance < 1000) {
      return `${Math.round(distance)} m`;
    }
    return `${(distance / 1000).toFixed(1)} km`;
  };

  const getRatingStars = (rating?: number) => {
    if (!rating) return '—';
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    return '★'.repeat(fullStars) + (hasHalfStar ? '½' : '') + '☆'.repeat(5 - Math.ceil(rating));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Vyhledat místo zájmu</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-slate-600 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Search Controls */}
        <div className="p-6 border-b border-slate-700 space-y-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zadejte název místa..."
              className="flex-1 bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            />
            <button
              onClick={performSearch}
              disabled={isLoading}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors"
            >
              {isLoading ? '...' : '🔍'}
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.key}
                onClick={() => setSelectedCategory(category.key as SearchCategory)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedCategory === category.key
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                {category.icon} {category.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="text-center text-red-400 mb-4">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="text-center text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto mb-2"></div>
              Vyhledávání...
            </div>
          )}

          {!isLoading && searchResults.length === 0 && !error && (
            <div className="text-center text-gray-400">
              {searchQuery || selectedCategory !== 'all'
                ? 'Nenalezena žádná místa'
                : 'Zadejte název místa nebo vyberte kategorii'}
            </div>
          )}

          {searchResults.map((poi, index) => (
            <div
              key={poi.placeId}
              onClick={() => handlePOISelect(poi)}
              className="bg-slate-700 hover:bg-slate-600 rounded-lg p-4 mb-3 cursor-pointer transition-colors border border-slate-600 hover:border-cyan-500"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-white text-lg mb-1">
                    {poi.name}
                  </h3>
                  <p className="text-gray-300 text-sm mb-2">
                    📍 {poi.address}
                  </p>

                  <div className="flex items-center space-x-4 text-sm text-gray-400">
                    {poi.rating && (
                      <span className="flex items-center">
                        <span className="mr-1">⭐</span>
                        {poi.rating} {getRatingStars(poi.rating)}
                      </span>
                    )}

                    {poi.priceLevel && (
                      <span>
                        💰 {'💰'.repeat(poi.priceLevel)}
                      </span>
                    )}

                    {userLocation && (
                      <span>
                        📏 {formatDistance(
                          Math.sqrt(
                            Math.pow(poi.location.lat - userLocation.lat, 2) +
                            Math.pow(poi.location.lng - userLocation.lng, 2)
                          ) * 111000 // Rough conversion to meters
                        )}
                      </span>
                    )}
                  </div>

                  {poi.types.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {poi.types.slice(0, 3).map((type, typeIndex) => (
                        <span
                          key={typeIndex}
                          className="bg-slate-600 text-xs px-2 py-1 rounded-full text-gray-300"
                        >
                          {type.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-cyan-400 ml-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium rounded-lg bg-slate-600 text-gray-200 hover:bg-slate-500 transition-colors"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};

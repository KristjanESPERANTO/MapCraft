import { useState, useRef, useEffect } from 'react';
import { countries, searchCountries, Country } from './countries';

interface CountryAutocompleteProps {
  onCountrySelect: (country: Country) => void;
  placeholder?: string;
  className?: string;
}

export function CountryAutocomplete({
  onCountrySelect,
  placeholder = "Search country...",
  className = ""
}: CountryAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Country[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (query.length > 0) {
      const results = searchCountries(query);
      setSuggestions(results.slice(0, 10)); // Limit to 10 results
      setIsOpen(results.length > 0);
      setSelectedIndex(-1);
    } else {
      setSuggestions([]);
      setIsOpen(false);
    }
  }, [query]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleCountrySelect(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleCountrySelect = (country: Country) => {
    setQuery('');
    setIsOpen(false);
    setSelectedIndex(-1);
    onCountrySelect(country);
  };

  const handleInputFocus = () => {
    if (query.length > 0 && suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay closing to allow for click events on suggestions
    setTimeout(() => {
      setIsOpen(false);
      setSelectedIndex(-1);
    }, 150);
  };

  return (
    <div className={`country-autocomplete ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className="country-search-input"
        autoComplete="off"
      />
      {isOpen && suggestions.length > 0 && (
        <ul ref={listRef} className="country-suggestions">
          {suggestions.map((country, index) => (
            <li
              key={country.iso3}
              className={`country-suggestion ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleCountrySelect(country)}
            >
              <span className="country-name">{country.name}</span>
              <span className="country-code">{country.iso3}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

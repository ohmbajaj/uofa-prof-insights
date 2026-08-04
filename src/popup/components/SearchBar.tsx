import { useState } from 'react';

interface SearchBarProps {
  onSearch: (name: string) => void;
  busy?: boolean;
}

export default function SearchBar({ onSearch, busy = false }: SearchBarProps) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();

  return (
    <form
      className="searchbar"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onSearch(trimmed);
      }}
    >
      <label className="visually-hidden" htmlFor="upi-search">
        Professor name
      </label>
      <input
        id="upi-search"
        className="searchbar__input"
        type="search"
        placeholder="Search a professor…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus
      />
      <button className="btn" type="submit" disabled={busy || !trimmed}>
        {busy ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}

type FavoriteStarProps = {
  filled: boolean;
  size?: number;
  disabled?: boolean;
  onClick: () => void;
};

export default function FavoriteStar({
  filled,
  size = 28,
  disabled = false,
  onClick,
}: FavoriteStarProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={filled ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        background: "none",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        padding: "2px",
        lineHeight: 1,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? "var(--accent)" : "none"}
        stroke={filled ? "var(--accent)" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}

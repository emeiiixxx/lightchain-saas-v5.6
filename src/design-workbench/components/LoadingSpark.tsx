import './loading-spark.css';

const stars = ['primary', 'secondary-a', 'secondary-b'] as const;

// Figma 227:21420 → LoadingSpark 118:1829. Each original vector has its
// own 3-second position, scale and opacity track; the container stays still.
export function LoadingSpark({ className = '' }: { className?: string }) {
  return <span className={`lc-loading-spark ${className}`} aria-hidden="true">
    {stars.map(star => <span key={star} className={`lc-loading-spark__star lc-loading-spark__star--${star}`}>
      <img src={`/assets/loading-spark/${star}.svg`} alt="" draggable={false} />
    </span>)}
  </span>;
}

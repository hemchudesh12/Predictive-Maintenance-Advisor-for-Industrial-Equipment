// src/components/SkeletonCard.tsx
// Skeleton loader for machine cards before first frame

export function SkeletonCard() {
  return (
    <div className="card" style={{ marginBottom: 'var(--gap-card)', borderRadius: 'var(--border-radius)' }}>
      <div className="flex justify-between items-center">
        <div>
          <div className="skeleton" style={{ width: 80, height: 12, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: 60, height: 10 }} />
        </div>
        <div className="skeleton" style={{ width: 64, height: 20, borderRadius: 20 }} />
      </div>
      <div className="skeleton" style={{ width: 100, height: 20, marginTop: 10 }} />
      <div className="skeleton" style={{ width: '100%', height: 4, marginTop: 8 }} />
    </div>
  );
}

export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  // Abstract mark: two linked circles (two countries) with a traffic-light dot row
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#0b1f3a" />
      <circle cx="16" cy="18" r="7.5" fill="none" stroke="#12a3c4" strokeWidth="2.6" />
      <circle cx="24" cy="18" r="7.5" fill="none" stroke="#ffffff" strokeWidth="2.6" opacity=".9" />
      <circle cx="14" cy="31" r="2" fill="#22a35a" />
      <circle cx="20" cy="31" r="2" fill="#f59e0b" />
      <circle cx="26" cy="31" r="2" fill="#dc2626" />
    </svg>
  );
}

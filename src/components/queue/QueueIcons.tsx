export function QueueIcon() {
  return (
    <svg
      className="queue-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4v6a4 4 0 0 0 4 4h10" />
      <path d="m16 11 3 3-3 3" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg
      className="queue-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m6 7 1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

export function ChevronIcon({ collapsed }: { readonly collapsed: boolean }) {
  return (
    <svg
      className="queue-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {collapsed ? <path d="m7 15 5-5 5 5" /> : <path d="m7 9 5 5 5-5" />}
    </svg>
  );
}

export function QueueControlIcon({ paused }: { readonly paused: boolean }) {
  return (
    <svg
      className="queue-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paused ? (
        <path d="m9 7 8 5-8 5V7Z" />
      ) : (
        <>
          <path d="M9 7v10" />
          <path d="M15 7v10" />
        </>
      )}
    </svg>
  );
}

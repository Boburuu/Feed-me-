export type IconName =
  | "home"
  | "chart"
  | "user"
  | "plus"
  | "water"
  | "flame"
  | "shoe"
  | "apple"
  | "camera"
  | "image"
  | "target"
  | "barcode"
  | "calendar"
  | "book"
  | "clock"
  | "users"
  | "chevron"
  | "close"
  | "check"
  | "lock"
  | "scale"
  | "trash"
  | "edit"
  | "download"
  | "upload"
  | "backspace"
  | "minus"
  | "share"
  | "link";

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <path d="M5 12h14" />,
    water: <path d="M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12Z" />,
    flame: <path d="M12 22c4 0 7-2.8 7-7 0-3.6-2.2-6.4-5.5-9.8.2 2.7-1.3 4.3-2.5 5.3.2-3.8-1.8-6.4-3.2-7.5.1 3.7-3.8 6.8-3.8 12 0 4.2 3.3 7 8 7Z" />,
    shoe: <><path d="M3 15c4.5.2 6.3-1.8 7-6l4 4 6.5 2.5c1 .4 1.3 1.7.6 2.5-.6.7-1.5 1-2.4 1H5c-1.7 0-2.7-2.1-2-4Z" /><path d="m13 12 2-2m1.5 4 1.3-1.3" /></>,
    apple: <><path d="M12 7c-2.4-3.5-8-2.4-8 3.6C4 16 7.5 21 10 21c1 0 1.2-.7 2-.7s1 .7 2 .7c2.5 0 6-5 6-10.4C20 4.6 14.4 3.5 12 7Z" /><path d="M12 7c0-2.5 1.6-4 4-4" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
    camera: <><path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4.5Z" /><circle cx="12" cy="12.5" r="4" /></>,
    // Code-barres : cadre de visée et barres verticales, reconnaissable d'un coup d'œil.
    barcode: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 8v8M10 8v8M12.5 8v8M15 8v8M17.5 8v8" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    calendar: <><path d="M5 3v3m14-3v3M3 9h18" /><rect x="3" y="5" width="18" height="16" rx="2" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87m-2-12a4 4 0 0 1 0 7.75" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    scale: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 9a5 5 0 0 1 8 0" /><path d="m12 9 1.5-2" /></>,
    trash: <><path d="M4 7h16" /><path d="M10 11v6m4-6v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13 7 4 4" /></>,
    download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
    upload: <><path d="M12 15V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    backspace: <><path d="M9 5h11v14H9l-6-7 6-7Z" /><path d="m12 9 5 6m0-6-5 6" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}

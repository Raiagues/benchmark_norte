import React from "react";
const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  input: "M14 3h6v18h-6 M3 12h12 M10 7l5 5-5 5",
  output: "M10 3H4v18h6 M11 12h10 M16 7l5 5-5 5",
  model:
    "M7 5h10v14H7z M10 9h4 M10 13h4 M10 1v4 M14 1v4 M10 19v4 M14 19v4 M3 9h4 M17 9h4 M3 15h4 M17 15h4",
  reference: "M5 3h14v18H5z M8 8l2 2 4-4 M8 14h8 M8 17h5",
  chart: "M3 3v18h18 M7 17v-5 M12 17V7 M17 17V4",
  graph: "M4 4h5v5H4z M15 15h5v5h-5z M15 3h5v5h-5z M9 6h6 M7 9v8h8",
  change: "M3 7h16 M15 3l4 4-4 4 M21 17H5 M9 13l-4 4 4 4",
  run: "M8 4l13 8-13 8z",
  document: "M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6",
  sensor: "M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0 M12 8v9 M17 6h3 M17 10h2",
  switch: "M3 12h6 M15 12h6 M9 12l7-7 M8 10v4 M16 10v4",
  config: "M5 3v18 M12 3v18 M19 3v18 M2 8h6 M9 16h6 M16 7h6",
  check: "M4 12l5 5L20 6",
  close: "M5 5l14 14 M19 5L5 19",
  edit: "M4 16v4h4L20 8l-4-4z M13 7l4 4",
  lock: "M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  history: "M3 10a9 9 0 1 1 1 8 M3 4v6h6 M12 7v5l3 2",
  arrow: "M4 12h16 M14 6l6 6-6 6",
};
export default function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {name === "fan" ? (
        <>
          <rect x="2" y="2" width="20" height="20" rx="4" />
          <circle cx="12" cy="12" r="2" />
          {[0, 90, 180, 270].map((a) => (
            <path
              key={a}
              transform={`rotate(${a} 12 12)`}
              d="M11 10C6 4 17 3 16 8c0 2-2 3-2 3"
            />
          ))}
        </>
      ) : (
        <path d={paths[name] || paths.document} />
      )}
    </svg>
  );
}

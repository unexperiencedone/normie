/**
 * The clinic schema in Chen notation, as Normie's schema page draws it: entities (rectangles),
 * relationships (diamonds), key attributes (underlined, lime), 1/N cardinality and total
 * participation (double lines) on the side whose foreign key is NOT NULL.
 */
export function ChenClinic({ className }: { className?: string }) {
  const doubleLines = "M238 160L285 200M402 160L365 200M325 310V330";
  return (
    <svg role="img" aria-label="Chen ER diagram of the clinic schema" viewBox="0 0 640 400" className={className} style={{ fontFamily: "var(--font-inter), sans-serif" }}>
      <g fill="none" stroke="var(--muted)" strokeWidth="1.2">
        <path d="M62 34L85 60M150 34L120 60M52 128L80 100M500 34L525 60M590 34L560 60M590 128L560 100M215 222L255 220M424 222L395 220M215 348L255 350M452 337L395 345M452 373L395 355" />
      </g>
      <path d="M130 100L172 140M510 100L468 140M325 240V270" fill="none" stroke="var(--text)" strokeWidth="1.3" />
      <path d={doubleLines} fill="none" stroke="var(--text)" strokeWidth="4.5" />
      <path d={doubleLines} fill="none" stroke="var(--surface)" strokeWidth="1.6" />
      <g fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.6">
        <rect x="40" y="60" width="120" height="40" rx="2" />
        <rect x="480" y="60" width="120" height="40" rx="2" />
        <rect x="255" y="200" width="140" height="40" rx="2" />
        <rect x="255" y="330" width="140" height="40" rx="2" />
      </g>
      <g fill="var(--accent-soft)" stroke="var(--text-2)" strokeWidth="1.4">
        <path d="M205 132l40 18-40 18-40-18z" />
        <path d="M435 132l40 18-40 18-40-18z" />
        <path d="M325 272l42 18-42 18-42-18z" />
      </g>
      <g strokeWidth="1.3">
        {[
          [60, 22, 40, true],
          [152, 22, 28, false],
          [48, 140, 30, false],
          [500, 22, 40, true],
          [592, 22, 28, false],
          [592, 140, 38, false],
          [190, 222, 24, false],
          [470, 222, 54, true],
          [160, 350, 56, true],
          [482, 334, 28, false],
          [482, 374, 40, false],
        ].map(([cx, cy, rx, key], i) => (
          <ellipse
            key={i}
            cx={cx as number}
            cy={cy as number}
            rx={rx as number}
            ry="13"
            fill={key ? "var(--brand-soft)" : "var(--surface)"}
            stroke={key ? "var(--brand-strong)" : "var(--muted)"}
          />
        ))}
      </g>
      <g fontSize="11" fill="var(--text)" textAnchor="middle">
        <text x="60" y="26" textDecoration="underline">patient_id</text>
        <text x="152" y="26">name</text>
        <text x="48" y="144">phone</text>
        <text x="500" y="26" textDecoration="underline">doctor_id</text>
        <text x="592" y="26">name</text>
        <text x="592" y="144">specialty</text>
        <text x="190" y="226">at</text>
        <text x="470" y="226" textDecoration="underline">appointment_id</text>
        <text x="160" y="354" textDecoration="underline">prescription_id</text>
        <text x="482" y="338">drug</text>
        <text x="482" y="378">diagnosis</text>
      </g>
      <g fontSize="12" fontWeight="700" fill="var(--text)" textAnchor="middle" letterSpacing=".04em">
        <text x="100" y="84">PATIENT</text>
        <text x="540" y="84">DOCTOR</text>
        <text x="325" y="224">APPOINTMENT</text>
        <text x="325" y="354">PRESCRIPTION</text>
      </g>
      <g fontSize="11" fontWeight="600" fill="var(--text)" textAnchor="middle">
        <text x="205" y="154">books</text>
        <text x="435" y="154">attends</text>
        <text x="325" y="294">issues</text>
      </g>
      <g fontSize="11" fontWeight="700" fill="var(--accent)" style={{ fontFamily: "var(--font-dm-mono), monospace" }}>
        <text x="146" y="128">1</text>
        <text x="272" y="186">N</text>
        <text x="486" y="128">1</text>
        <text x="372" y="186">N</text>
        <text x="332" y="262">1</text>
        <text x="332" y="326">N</text>
      </g>
    </svg>
  );
}

import type { SVGProps } from "react";

/** X (Twitter) brand mark. Lucide doesn't ship brand logos. */
export function XLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Mako fin mark (brand mascot). */
export function Fin(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M3 17.5c4-.6 7-4.5 8-12.5 3 4.5 5.6 8.6 9.5 12.5z" />
      <path d="M1.5 20.2q2.6-1.6 5.3 0t5.3 0 5.3 0 5.1 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

import { Link } from "react-router-dom";

export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <Link to="/impressum">Impressum</Link>
      <span className="footer-sep" aria-hidden="true">·</span>
      <Link to="/datenschutz">Datenschutz</Link>
      <span className="footer-sep" aria-hidden="true">·</span>
      <Link to="/anleitung">Anleitung</Link>
    </footer>
  );
}
